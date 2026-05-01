/* ==========================================================================
   MÓDULO DE CONTROLE (Controller Layer)
   Arquitetura: Mediador MVC (Model-View-Controller)
   ========================================================================== */

/**
 * @class BuscaARTController
 * @description Classe orquestradora. Instancia a View (PainelBuscaControle), recebe
 * eventos de tela, monta a Estratégia de busca requisitada e injeta no Motor Assíncrono (Varredor).
 */
class BuscaARTController {
    /**
     * @param {Object} rootDependencies - Injeção das globais (UIFactory, Utils, Comm).
     */
    constructor(rootDependencies) {
        this._UI = rootDependencies.UIFactory;
        this._Utils = rootDependencies.Utils;
        this._CommBridge = rootDependencies.CommBridge;
        this._creaHelper = rootDependencies.creaHelper;
        this._uiFactory = rootDependencies.factory;

        this._estrategiaAtual = null;
        this._estadoAtualBusca = null;
        this._painelUI = null;

        // 1. Inicializamos a Camada Lógica (O Motor passivo)
        this._motorServico = new VarredorDeArtsService(this._CommBridge);
        this._configurarHooksDoMotor();
    }

    inicializar() {
        const _fab = this._UI.createFab(this._UI.icons.get('SEARCH'), async () => {
            if (!this._painelUI) {
                const autoData = await this._extrairDadosContextuaisCasoExistaRmoAberto();
                this._painelUI = this._uiFactory.montarPainelDeBusca(this, autoData);
            } else {
                this._painelUI.toggle();
            }
        }, "Alternar Oráculo");
        
        _fab.mount();
    }

    /* --------------------------------------------------------------------------
       EVENTOS DISPARADOS PELA VIEW (PainelBuscaControle)
       -------------------------------------------------------------------------- */

    async handleIniciarBusca({ modo, ...dadosForm }) {
        try {
            // A. Padrão Factory: Fabricar dinamicamente a Estratégia requerida pela tela
            let dependenciasDomain = { Utils: this._Utils, CommBridge: this._CommBridge };

            if (modo === 'address') this._estrategiaAtual = new FiltroPorEndereco(dadosForm, dependenciasDomain);
            else if (modo === 'contract') this._estrategiaAtual = new FiltroPorContrato(dadosForm, dependenciasDomain);
            else if (modo === 'document') this._estrategiaAtual = new FiltroPorDocumento(dadosForm, dependenciasDomain);
            else if (modo === 'professional') this._estrategiaAtual = new FiltroPorProfissional(dadosForm, dependenciasDomain);
            else if (modo === 'direct') this._estrategiaAtual = new FiltroPorNumeroART(dadosForm, dependenciasDomain);
            else if (modo === 'cnae') this._estrategiaAtual = new ConsultaEmpresaCnae(dadosForm, dependenciasDomain);
            else throw new Error("Aba de busca não configurada.");

            this._painelUI.limparResultados();

            // B. Declarar o limite da paginação assíncrona (Ex: Processar 5 requisições de uma vez)
            const pagInicial = parseInt(dadosForm.pagina, 10) || 1;
            const PICS_LIMITE = 5; 
            this._estadoAtualBusca = new EstadoPaginacao(pagInicial, PICS_LIMITE);

            // C. Injetar a estratégia e o limite no motor e acelerar!
            const rmoAtiva = await this._extrairRmoAtiva();
            await this._motorServico.iniciarAssincrono(this._estrategiaAtual, this._estadoAtualBusca, rmoAtiva);

        } catch (erroRegraDeNegocio) {
            // O Catch superior captura tanto erros de validação simples quanto bugs pesados e pinta a Controller na cor certa
            this._painelUI.atualizarStatusBusca(erroRegraDeNegocio.message, "error");
            this._painelUI.bloquearInputs(false);
            console.warn("[Controller]", erroRegraDeNegocio);
        }
    }

    handleInterromperBusca() {
        if (this._estadoAtualBusca) {
            // A. Sinaliza ao motor para parar na próxima oportunidade
            this._estadoAtualBusca.abortar(); 
            
            // B. Libera a UI imediatamente para o usuário
            this._painelUI.atualizarStatusBusca("Busca interrompida pelo usuário.", "error");
            this._painelUI.bloquearInputs(false);
            
            // C. Limpa referências para evitar vazamento de lógica
            this._estrategiaAtual = null;
        }
    }

    /* --------------------------------------------------------------------------
       LIGAÇÃO PASSSIVA COM O MOTOR (Hooks de atualizacões puras)
       -------------------------------------------------------------------------- */

    _configurarHooksDoMotor() {
        this._motorServico.onStatusMudou = (tipo, mensagem) => {
            if (this._estadoAtualBusca?.isCancelado) return;
            this._painelUI.bloquearInputs(tipo === 'loading');
            this._painelUI.atualizarStatusBusca(mensagem, tipo);
        };
        
        this._motorServico.onResultadosEncontrados = (resultadosTratados) => {
            if (this._estadoAtualBusca?.isCancelado) return;
            if (this._painelUI) {
                const cardsProntos = resultadosTratados.map(dados => this._uiFactory.fabricarCardResultado(dados));
                this._painelUI.renderizarResultadosProntos(cardsProntos);
                this._UI.toast(`${resultadosTratados.length} ART(s) compatível(is) encontrada(s)!`, 'success', 0);
            }
        };

        this._motorServico.onPausadoParaContinuar = (estadoPaginacaoAtual) => {
            if (this._estadoAtualBusca?.isCancelado) return;
            this._painelUI.bloquearInputs(false);
            this._injetarBotaoDeContinuarFluxo(estadoPaginacaoAtual);
        };

        this._motorServico.onFimDaBusca = (mensagem) => {
            if (this._estadoAtualBusca?.isCancelado) return;
            const variant = mensagem.toLowerCase().includes('interrompida') ? "error" : "success";
            this._painelUI.atualizarStatusBusca(mensagem, variant);
            this._painelUI.bloquearInputs(false);
            this._estrategiaAtual = null; // Garbage clean
        };
    }

    /* --------------------------------------------------------------------------
       TRATAMENTO DE DOM LOCAL & MANIPULAÇÕES UTILITÁRIAS
       -------------------------------------------------------------------------- */



    _injetarBotaoDeContinuarFluxo(estadoPaginacaoAtual) {
        const c = document.getElementById('art-results-container');
        if (!c) return;
        const old = c.querySelector('#art-btn-continue'); if (old) old.remove();

        const totalStr = (estadoPaginacaoAtual.totalPaginas !== Infinity) ? ` de ${estadoPaginacaoAtual.totalPaginas}` : '';
        const btn = document.createElement('button');
        btn.id = 'art-btn-continue';
        btn.className = 'pts-btn pts-btn--ghost';
        btn.style.marginTop = "10px";
        btn.style.width = "100%";
        btn.innerHTML = `${this._UI.icons.get('REPEAT', { color: 'var(--th-info)' })} Continuar (Próxima Pág: ${estadoPaginacaoAtual.paginaAtual}${totalStr})`;

        btn.onclick = async () => {
            btn.remove();
            this._painelUI.bloquearInputs(true);
            // Re-acelera o motor injetando o exato momento pausado anteriormente!
            this._estadoAtualBusca.paginaLimite = (this._estadoAtualBusca.paginaAtual + 5) - 1; // Expande limite pra mais ciclo
            this._motorServico.iniciarAssincrono(this._estrategiaAtual, this._estadoAtualBusca, await this._extrairRmoAtiva());
        };
        
        c.appendChild(btn);
    }

    async _extrairRmoAtiva() {
        // Tenta buscar no Angular State Engine primariamente
        const dadosGerais = await this._creaHelper.rmo.getDadosRmo('geral');
        if (dadosGerais && dadosGerais.numero) return String(dadosGerais.numero);
        
        // Fallback: Tenta ler o state do Angular pelo Hash Router (Ionic navigation)
        try {
            const match = window.location.hash.match(/rmo(?:\/|-novo\/)(\d+)/);
            if (match) return match[1];
        } catch(e) {}
        
        return "";
    }

    async _extrairDadosContextuaisCasoExistaRmoAberto() {
        // O getDadosRmo agora possui retry interno de 10s via CreaHelper
        const endData = await this._creaHelper.rmo.getDadosRmo('endereco');
        
        if (endData && endData.endereco) {
            const strNums = `${endData.endereco} ${endData.numeroEnd || ''} ${endData.complemento || ''}`;
            const nums = strNums.match(/\d+/g);
            return { 
                logradouro: endData.endereco || "", 
                bairro: "", 
                numeros: nums ? [...new Set(nums)].join(", ") : "" 
            };
        }

        // Fallback: Varredura de DOM bruto legada, caso Angular não engate form.
        const g = n => { const e = document.querySelector(`input[formcontrolname="${n}"]`); return e ? e.value : ""; };
        const nums = (`${g('endereco')} ${g('numeroEnd')} ${g('complemento')}`).match(/\d+/g);
        return { logradouro: g('endereco')||"", bairro:"", numeros: nums?[...new Set(nums)].join(", "):"" };
    }
}
