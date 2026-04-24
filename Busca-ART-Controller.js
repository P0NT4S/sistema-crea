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
        const _fab = this._UI.createFab('🔍', () => {
            if (!document.getElementById('caca-art-painel') && !document.getElementById('form-address')) {
                this._injetarInterfaceNoDOM();
            } else {
                // Se o painel já existe, garante que ele ficará visível ao clicar no Fab
                if (this._painelUI && typeof this._painelUI.exibir === 'function') {
                    this._painelUI.exibir();
                } else {
                    const el = document.getElementById('caca-art-painel');
                    if(el) { el.style.display = 'flex'; el.style.opacity = '1'; }
                }
            }
        }, "Alternar Caça ART");
        
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
        const autoData = this._extrairDadosContextuaisCasoExistaRmoAberto();

        // Fazemos uso nativo e limpo dos componentes UI baseados em Classes
        const formEnd = new FormularioBusca(this._UI, 'address', '📍 Por Endereço', (ctx, inputs, ui) => {
            inputs.logradouro = ui.createInput(ctx, "Logradouro", "", "text", autoData.logradouro);
            inputs.bairro = ui.createInput(ctx, "Bairro", "", "text", autoData.bairro);
            
            // Componentes que vão ocupar a Row devem nascer sem parent inicialmente para não bagunçar o DOM tree
            inputs.numeros = ui.createInput(null, "Filtros Opcionais (CSV)", 'Ex: 10, conj, "lote a"', "text", autoData.numeros);
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.numeros, inputs.pagina]);
        });

        const formCont = new FormularioBusca(this._UI, 'contract', '📄 Por Contrato', (ctx, inputs, ui) => {
            inputs.cnpj = ui.createInput(ctx, "CNPJ do Contratante", "Ex: 00.000.000/0001-00", "text", "");
            
            inputs.contrato = ui.createInput(null, "Contrato/Ano", "Ex: 203/2025", "text", "");
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.contrato, inputs.pagina]);
        });

        const formDoc = new FormularioBusca(this._UI, 'document', '👤 Por CPF/CNPJ', (ctx, inputs, ui) => {
            inputs.docCpfCnpj = ui.createInput(ctx, "CPF ou CNPJ", "Ex: 000.000.000-00", "text", "");
            
            inputs.enderecoOpcional = ui.createInput(null, "Filtro de Endereço Opcional", 'Ex: lote, 35', "text", "");
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.enderecoOpcional, inputs.pagina]);
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
        btn.className = 'pts-btn pts-btn--ghost';
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
