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

        this._estrategiaAtual = null;
        this._estadoAtualBusca = null;

        // 1. Inicializamos a Camada Lógica (O Motor passivo)
        this._motorServico = new VarredorDeArtsService(this._CommBridge);
        this._configurarHooksDoMotor();

        // 2. Inicializamos a Camada Gráfica (O Painel passivo) passando "this" como "app"
        this._painelUI = new PainelBuscaControle(this, this._UI);
        
        // Contexto utilitário para ser consumido pelos Cards de renderização internos da GUI
        this._dependenciasDosCards = {
            uiFacade: this._UI,
            commBridge: this._CommBridge,
            creaHelper: this._creaHelper
        };
    }

    inicializar() {
        this._UI.createFab('🔍', "Alternar Caça ART", 'caca-art-painel', () => {
            if (!document.getElementById('caca-art-painel')) {
                this._injetarInterfaceNoDOM();
            }
        });
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
            else throw new Error("Aba de busca não configurada.");

            this._painelUI.limparResultados();

            // B. Declarar o limite da paginação assíncrona (Ex: Processar 5 requisições de uma vez)
            const pagInicial = parseInt(dadosForm.pagina, 10) || 1;
            const PICS_LIMITE = 5; 
            this._estadoAtualBusca = new EstadoPaginacao(pagInicial, PICS_LIMITE);

            // C. Injetar a estratégia e o limite no motor e acelerar!
            const rmoAtiva = this._Utils.crea.extrairIdRmo(document) || "";
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
            // Um tiro gentil: Aciona a flag booleana e o motor (Service) travará com segurança na próxima volta isolada
            this._estadoAtualBusca.abortar(); 
            this._painelUI.atualizarStatusBusca("Aguardando interrupção total do motor em background...", "warning");
        }
    }

    /* --------------------------------------------------------------------------
       LIGAÇÃO PASSSIVA COM O MOTOR (Hooks de atualizacões puras)
       -------------------------------------------------------------------------- */

    _configurarHooksDoMotor() {
        this._motorServico.onStatusMudou = (tipo, mensagem) => {
            this._painelUI.bloquearInputs(tipo === 'loading');
            this._painelUI.atualizarStatusBusca(mensagem, tipo);
        };
        
        this._motorServico.onResultadosEncontrados = (resultadosTratados) => {
            this._painelUI.renderizarResultados(resultadosTratados, this._dependenciasDosCards);
        };

        this._motorServico.onPausadoParaContinuar = (estadoPaginacaoAtual) => {
            this._painelUI.bloquearInputs(false);
            this._injetarBotaoDeContinuarFluxo(estadoPaginacaoAtual);
        };

        this._motorServico.onFimDaBusca = (mensagem) => {
            this._painelUI.atualizarStatusBusca(mensagem, "success");
            this._painelUI.bloquearInputs(false);
            this._estrategiaAtual = null; // Garbage clean
        };
    }

    /* --------------------------------------------------------------------------
       TRATAMENTO DE DOM LOCAL & MANIPULAÇÕES UTILITÁRIAS
       -------------------------------------------------------------------------- */

    _injetarInterfaceNoDOM() {
        const T = this._UI.templates;
        const autoData = this._extrairDadosContextuaisCasoExistaRmoAberto();

        // Arrow function ajudante pra envolver Elements HTMl brutos em interfaces .getValue() consumíveis limpas
        const wrap = (el) => ({
            getValue: () => el.value,
            setDisabled: (d) => { el.disabled = d; if(d) el.classList.add('input-locked'); else el.classList.remove('input-locked'); }
        });

        const formEnd = new FormularioBusca(this._UI, 'address', '📍 Por Endereço', (ctx, inputs) => {
            ctx.innerHTML = `
                ${T.formInput({ label: "Logradouro", id: "inp-log", value: autoData.logradouro })}
                ${T.formInput({ label: "Bairro", id: "inp-bai", value: autoData.bairro })}
                ${T.flexRow([
                    { flex: 2, html: T.formInput({ label: "Filtros (CSV)", id: "inp-num", placeholder: 'Ex: 10, conj, "lote a"', value: autoData.numeros }) },
                    { flex: 1, html: T.formInput({ label: "Pág. Inicial", id: "inp-pg-addr", type: "number", value: "1", min: "1" }) }
                ])}
            `;
            const g = id => ctx.querySelector(`#${id}`);
            inputs.logradouro = wrap(g('inp-log')); inputs.bairro = wrap(g('inp-bai'));
            inputs.numeros = wrap(g('inp-num')); inputs.pagina = wrap(g('inp-pg-addr'));
        });

        const formCont = new FormularioBusca(this._UI, 'contract', '📄 Por Contrato', (ctx, inputs) => {
            ctx.innerHTML = `
                ${T.formInput({ label: "CNPJ do Contratante", id: "inp-cnpj", placeholder: "Ex: 00.000.000/0001-00" })}
                ${T.flexRow([
                    { flex: 2, html: T.formInput({ label: "Contrato/Ano", id: "inp-ctr", placeholder: "Ex: 203/2025" }) },
                    { flex: 1, html: T.formInput({ label: "Pág. Inicial", id: "inp-pg-ctr", type: "number", value: "1", min: "1" }) }
                ])}
            `;
            const g = id => ctx.querySelector(`#${id}`);
            inputs.cnpj = wrap(g('inp-cnpj')); inputs.contrato = wrap(g('inp-ctr')); inputs.pagina = wrap(g('inp-pg-ctr'));
        });

        const formDoc = new FormularioBusca(this._UI, 'document', '👤 Por CPF/CNPJ', (ctx, inputs) => {
            ctx.innerHTML = `
                ${T.formInput({ label: "CPF ou CNPJ", id: "inp-doc", placeholder: "Ex: 00.000.000/0001-00" })}
                ${T.flexRow([
                    { flex: 2, html: T.formInput({ label: "Filtro de Endereço Opcional", id: "inp-end", placeholder: 'Ex: 10, conj, "lote a"' }) },
                    { flex: 1, html: T.formInput({ label: "Pág. Inicial", id: "inp-pg-doc", type: "number", value: "1", min: "1" }) }
                ])}
            `;
            const g = id => ctx.querySelector(`#${id}`);
            inputs.docCpfCnpj = wrap(g('inp-doc')); inputs.enderecoOpcional = wrap(g('inp-end')); inputs.pagina = wrap(g('inp-pg-doc'));
        });

        this._painelUI.construirPainel([formEnd, formCont, formDoc]);
    }

    _injetarBotaoDeContinuarFluxo(estadoPaginacaoAtual) {
        const c = document.getElementById('art-results-container');
        if (!c) return;
        const old = c.querySelector('#art-btn-continue'); if (old) old.remove();

        const totalStr = (estadoPaginacaoAtual.totalPaginas !== Infinity) ? ` de ${estadoPaginacaoAtual.totalPaginas}` : '';
        const btn = document.createElement('button');
        btn.id = 'art-btn-continue';
        btn.className = 'my-btn pts-btn--ghost my-col';
        btn.style.marginTop = "10px";
        btn.style.width = "100%";
        btn.innerHTML = `🔄 Continuar (Próxima Pág: ${estadoPaginacaoAtual.paginaAtual}${totalStr})`;

        btn.onclick = () => {
            btn.remove();
            this._painelUI.bloquearInputs(true);
            // Re-acelera o motor injetando o exato momento pausado anteriormente!
            this._estadoAtualBusca.paginaLimite = (this._estadoAtualBusca.paginaAtual + 5) - 1; // Expande limite pra mais ciclo
            this._motorServico.iniciarAssincrono(this._estrategiaAtual, this._estadoAtualBusca, this._Utils.crea.extrairIdRmo(document));
        };
        
        c.appendChild(btn);
    }

    _extrairDadosContextuaisCasoExistaRmoAberto() {
        const g = n => { const e = document.querySelector(`input[formcontrolname="${n}"]`); return e ? e.value : ""; };
        const nums = (`${g('endereco')} ${g('numeroEnd')} ${g('complemento')}`).match(/\d+/g);
        return { logradouro: g('endereco')||"", bairro:"", numeros: nums?[...new Set(nums)].join(", "):"" };
    }
}
