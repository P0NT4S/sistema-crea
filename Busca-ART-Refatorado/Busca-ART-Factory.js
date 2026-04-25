/* ==========================================================================
   MÓDULO DE FÁBRICA (Factory Layer)
   ========================================================================== */

/**
 * @class BuscaARTUIFactory
 * @description Centraliza a montagem de todos os componentes visuais complexos.
 * Desacopla a instanciação do Controller e assegura Injeção de Dependência limpa para as Views.
 */
class BuscaARTUIFactory {
    /**
     * @param {Object} dependencias - Injeção das globais (UIFacade, CreaHelper, CommBridge).
     */
    constructor(dependencias) {
        this._uiFacade = dependencias.UIFactory;
        this._creaHelper = dependencias.creaHelper;
        this._commBridge = dependencias.CommBridge;
    }

    /**
     * Fabrica o painel completo de buscas com seus subformulários.
     * @param {BuscaARTController} appController - Controller atuando como Mediador.
     * @param {Object} dadosContextuais - Dados colhidos da página atual para pré-preenchimento.
     * @returns {PainelBuscaControle} Painel montado.
     */
    montarPainelDeBusca(appController, dadosContextuais) {
        const painelUI = new PainelBuscaControle(appController, this._uiFacade);
        
        const formEnd = new FormularioBusca(this._uiFacade, 'address', '📍 Por Endereço', (ctx, inputs, ui) => {
            inputs.logradouro = ui.createInput(ctx, "Logradouro", "", "text", dadosContextuais.logradouro);
            inputs.logradouro.mount();

            inputs.bairro = ui.createInput(ctx, "Bairro", "", "text", dadosContextuais.bairro);
            inputs.bairro.mount();
            
            inputs.numeros = ui.createInput(null, "Filtros Opcionais (CSV)", 'Ex: 10, conj, "lote a"', "text", dadosContextuais.numeros);
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.numeros, inputs.pagina]).mount();
        });

        const formCont = new FormularioBusca(this._uiFacade, 'contract', '📄 Por Contrato', (ctx, inputs, ui) => {
            inputs.cnpj = ui.createInput(ctx, "CNPJ do Contratante", "Ex: 00.000.000/0001-00", "text", "");
            inputs.cnpj.mount();
            
            inputs.contrato = ui.createInput(null, "Contrato/Ano", "Ex: 203/2025", "text", "");
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.contrato, inputs.pagina]).mount();
        });

        const formDoc = new FormularioBusca(this._uiFacade, 'document', '👤 Por CPF/CNPJ', (ctx, inputs, ui) => {
            inputs.docCpfCnpj = ui.createInput(ctx, "CPF ou CNPJ", "Ex: 000.000.000-00", "text", "");
            inputs.docCpfCnpj.mount();
            
            inputs.enderecoOpcional = ui.createInput(null, "Filtro de Endereço Opcional", 'Ex: lote, 35', "text", "");
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.enderecoOpcional, inputs.pagina]).mount();
        });

        painelUI.construirPainel([formEnd, formCont, formDoc]);
        return painelUI;
    }

    /**
     * Instancia um CardResultado individual e adiciona as abas abstratas.
     * @param {Object} dadosART - DTO extraído da Strategy do Motor.
     * @returns {CardResultado}
     */
    fabricarCardResultado(dadosART) {
        // O Card precisa do CommBridge para dar Lazy-Fetch nos detalhes profundos,
        // do parser para extrair, e da uiFacade. Repassamos tudo centralizado.
        const dependenciasParaOCard = {
            uiFacade: this._uiFacade,
            commBridge: this._commBridge,
            creaHelper: this._creaHelper
        };

        const card = new CardResultado(dadosART, dependenciasParaOCard);
        
        // Factory agindo de verdade: Constrói a Composição do Componente injetando Abas!
        card.addAbaDetalhe(new AbaDetalheAtividades(this._uiFacade));
        card.addAbaDetalhe(new AbaDetalheProprietario(this._uiFacade, this._creaHelper.rmo));
        
        return card;
    }
}
