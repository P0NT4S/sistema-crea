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
        this._utilsCore = dependencias.Utils;
    }

    /**
     * Fabrica o painel completo de buscas com seus subformulários.
     * @param {BuscaARTController} appController - Controller atuando como Mediador.
     * @param {Object} dadosContextuais - Dados colhidos da página atual para pré-preenchimento.
     * @returns {PainelBuscaControle} Painel montado.
     */
    montarPainelDeBusca(appController, dadosContextuais) {
        const painelUI = new PainelBuscaControle(appController, this._uiFacade);
        
        const formEnd = new FormularioBusca(this._uiFacade, 'address', '📍 Endereço', (ctx, inputs, ui) => {
            inputs.logradouro = ui.createInput(ctx, "Logradouro", "", "text", dadosContextuais.logradouro);
            inputs.logradouro.mount();

            inputs.bairro = ui.createInput(ctx, "Bairro", "", "text", dadosContextuais.bairro);
            inputs.bairro.mount();
            
            inputs.numeros = ui.createInput(null, "Filtros Opcionais (CSV)", 'Ex: 10, conj, "lote a"', "text", dadosContextuais.numeros);
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.numeros, inputs.pagina]).mount();
        });

        const formProf = new FormularioBusca(this._uiFacade, 'professional', '👤 Profissional', (ctx, inputs, ui) => {
            inputs.campo = ui.createSelect(ctx, "Buscar por", [
                { label: "Registro", value: "registro" },
                { label: "CPF/CNPJ", value: "cpf_cnpj" },
                { label: "Nome", value: "nome" }
            ], "registro");
            inputs.campo.mount();

            inputs.valor = ui.createInput(ctx, "Valor da busca", "Ex: 12345DDF", "text", "");
            inputs.valor.mount();

            inputs.enderecoOpcional = ui.createInput(null, "Filtro de Endereço Opcional", 'Ex: lote, 35', "text", "");
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            ui.createFlexRow(ctx, [inputs.enderecoOpcional, inputs.pagina]).mount();
        });

        const formNum = new FormularioBusca(this._uiFacade, 'direct', '🔢 Número ART', (ctx, inputs, ui) => {
            inputs.numeroArt = ui.createInput(ctx, "Número da ART", "Ex: 0720250007491", "text", "");
            inputs.numeroArt.mount();
        });

        const formCnae = new FormularioBusca(this._uiFacade, 'cnae', '🏢 CNAE/CREA', (ctx, inputs, ui) => {
            inputs.cnpj = ui.createInput(ctx, "CNPJ da Empresa", "Ex: 00.000.000/0001-00", "text", "");
            inputs.cnpj.mount();
        });

        const formCont = new FormularioBusca(this._uiFacade, 'contract', '📄 Contrato', (ctx, inputs, ui) => {
            inputs.cnpj = ui.createInput(ctx, "CNPJ do Contratante", "Ex: 00.000.000/0001-00", "text", "");
            inputs.cnpj.mount();
            
            inputs.contrato = ui.createInput(null, "Contrato/Ano", "Ex: 203/2025", "text", "");
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.contrato, inputs.pagina]).mount();
        });

        const formDoc = new FormularioBusca(this._uiFacade, 'document', '🆔 Doc. Prop.', (ctx, inputs, ui) => {
            inputs.docCpfCnpj = ui.createInput(ctx, "CPF ou CNPJ", "Ex: 000.000.000-00", "text", "");
            inputs.docCpfCnpj.mount();
            
            inputs.enderecoOpcional = ui.createInput(null, "Filtro de Endereço Opcional", 'Ex: lote, 35', "text", "");
            inputs.pagina = ui.createInput(null, "Pág. Inicial", "", "number", "1");
            
            ui.createFlexRow(ctx, [inputs.enderecoOpcional, inputs.pagina]).mount();
        });

        painelUI.construirPainel([formEnd, formProf, formNum, formCnae, formCont, formDoc]);
        return painelUI;
    }

    /**
     * Instancia um CardResultado individual e adiciona as abas abstratas.
     * @param {Object} dados - DTO extraído da Strategy do Motor.
     * @returns {CardResultado|Object}
     */
    fabricarCardResultado(dados) {
        // Suporte para Cards Especiais (CNAE ou Ações Diretas)
        if (dados.isCnaeCard) {
            return new CnaeCardResultado(dados, { uiFacade: this._uiFacade });
        }
        
        if (dados.isAction) {
            return {
                render: () => {
                    const el = document.createElement('div');
                    el.style.cssText = 'padding: 10px; margin-bottom: 10px; border-radius: 8px; background: rgba(var(--th-success-rgb), 0.1); border: 1px solid var(--th-success); color: var(--th-success); font-size: 13px; font-weight: bold;';
                    el.innerText = `✅ ${dados.message}`;
                    return el;
                }
            };
        }

        const dependenciasParaOCard = {
            uiFacade: this._uiFacade,
            commBridge: this._commBridge,
            creaHelper: this._creaHelper
        };

        const card = new CardResultado(dados, dependenciasParaOCard);
        
        card.addAbaDetalhe(new AbaDetalheAtividades(this._uiFacade));
        card.addAbaDetalhe(new AbaDetalheObservacoes(this._uiFacade));
        card.addAbaDetalhe(new AbaDetalheResponsaveis(this._uiFacade, this._creaHelper.rmo, this._utilsCore));
        card.addAbaDetalhe(new AbaDetalheOutros(this._uiFacade, this._creaHelper.rmo, dados, this._utilsCore));
        
        return card;
    }
}
