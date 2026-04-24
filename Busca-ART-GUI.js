// ==========================================================================
// MÓDULO VISUAL E COMPONENTES (View & UI Controllers)
// Arquitetura baseada no diagrama UML: MVC / Component-based
// ==========================================================================

/**
 * @class FormularioBusca
 * @description Representa um formulário isolado (Ex: Por Endereço, Por Contrato).
 * Atua como um "agregado" dentro do ConteinerFormulariosBusca.
 */
class FormularioBusca {
    /**
     * @param {UIFacade} uiFacade - A biblioteca de UI.
     * @param {String} modoID - Identificador único (ex: 'endereço').
     * @param {String} tituloAba - Título que aparecerá na aba.
     * @param {Function} construtorDeCampos - Callback para instanciar os campos nativos da UIFactory.
     */
    constructor(uiFacade, modoID, tituloAba, construtorDeCampos) {
        this._modoID = modoID;
        this._tituloAba = tituloAba;
        this._uiFacade = uiFacade;
        
        this._conteiner = document.createElement('div');
        this._conteiner.id = `form-${modoID}`;
        this._conteiner.style.display = 'none';
        
        this._inputs = {}; // Guarda as instâncias de FormBase (Input, Select, etc)

        // Aciona a injeção dos campos no momento da construção
        if (construtorDeCampos) {
            construtorDeCampos(this._conteiner, this._inputs, this._uiFacade);
        }
    }

    getModoID() { return this._modoID; }
    getTituloAba() { return this._tituloAba; }
    getNode() { return this._conteiner; }
    
    show() { this._conteiner.style.display = 'block'; }
    hide() { this._conteiner.style.display = 'none'; }

    /** Extrai os valores das instâncias internas dos inputs */
    getValores() {
        const valores = {};
        for (let chave in this._inputs) {
            valores[chave] = this._inputs[chave].getValue();
        }
        return valores;
    }

    /** Bloqueia ou desbloqueia todos os inputs deste formulário */
    bloquearInputs(isRodando) {
        for (let chave in this._inputs) {
            this._inputs[chave].setDisabled(isRodando);
        }
    }
}

/**
 * @class ConteinerFormulariosBusca
 * @description O Painel físico. Orquestra a exibição das abas e repassa os eventos (cliques).
 */
class ConteinerFormulariosBusca {
    constructor(uiFacade, callbacks) {
        this._uiFacade = uiFacade;
        this._callbacks = callbacks;
        this._formularios = []; // Array de FormularioBusca
        this._ordemDosModos = []; // Array de Strings (IDs)
        this._modoAtivo = null;
        this._esteConteiner = null;
        this.panelInstance = null; // Acesso público temporário caso necessário pela lib base
    }

    /** @param {FormularioBusca} formComponent */
    addModo(formComponent) {
        this._formularios.push(formComponent);
        this._ordemDosModos.push(formComponent.getModoID());
        
        if (!this._modoAtivo) {
            this._modoAtivo = formComponent.getModoID();
        }
    }

    render() {
        if (this._formularios.length === 0) throw new Error("Nenhum formulário adicionado ao contêiner.");

        this.panelInstance = this._uiFacade.createPanel({
            id: 'caca-art-painel', title: "🕵️ Buscar ARTs", width: "550px", draggable: true, persist: true, closeButton: true,
            html: `
                <div id="forms-container"></div>
                ${this._uiFacade.templates.divider('', 'none')}
                <div class="my-row" style="margin-top: 10px;">
                    <button id="art-btn-search" class="my-btn my-btn--primary my-col">🔍 Pesquisar</button>
                    <button id="art-btn-cancel" class="my-btn my-btn--danger my-col" style="display:none;">⛔ Parar Busca</button>
                </div>
                <div id="art-results-container" style="margin-top: 20px;"></div>
            `
        });

        const formsContainer = this.panelInstance.querySelector('#forms-container');
        this._formularios.forEach(form => formsContainer.appendChild(form.getNode()));
        
        this._construirAbas();
        this._bindEvents();
        this._alternarModo(this._modoAtivo);
        
        this._esteConteiner = this.panelInstance.querySelector('#art-results-container');
        return this._esteConteiner;
    }

    setStatusCarregando(isLoading) {
        this.panelInstance.querySelector('#art-btn-search').style.display = isLoading ? 'none' : 'flex';
        this.panelInstance.querySelector('#art-btn-cancel').style.display = isLoading ? 'flex' : 'none';
        
        const formAtivo = this._formularios.find(f => f.getModoID() === this._modoAtivo);
        if (formAtivo) formAtivo.bloquearInputs(isLoading);
    }

    _construirAbas() {
        const itensAba = this._formularios.map(form => ({
            label: form.getTituloAba(),
            active: form.getModoID() === this._modoAtivo,
            onClick: () => this._alternarModo(form.getModoID())
        }));

        const tabs = this._uiFacade.createTabs({ items: itensAba });
        Array.from(tabs.children).forEach(tab => { tab.style.flex = "1"; tab.style.textAlign = "center"; });
        
        const panelBody = this.panelInstance.querySelector('.my-panel-body');
        panelBody.insertBefore(tabs, panelBody.firstChild);
        return tabs;
    }

    _alternarModo(modoID) {
        this._modoAtivo = modoID;
        this._formularios.forEach(form => {
            if (form.getModoID() === modoID) form.show();
            else form.hide();
        });
    }

    _bindEvents() {
        this.panelInstance.querySelector('#art-btn-search').onclick = () => {
            const formAtivo = this._formularios.find(f => f.getModoID() === this._modoAtivo);
            this._callbacks.onSearch(this._modoAtivo, formAtivo.getValores());
        };
        this.panelInstance.querySelector('#art-btn-cancel').onclick = () => this._callbacks.onCancel();
    }
}

/**
 * @class DetalhesCardResultado
 * @description O miolo do Card. Instanciado via Lazy Load. Focado nas abas profundas e na injeção de dados (RMO).
 */
class DetalhesCardResultado {
    constructor(uiFacade, dadosART, conexaoRMO) {
        this._uiFacade = uiFacade;
        this._dadosART = dadosART; // Dados ricos, provenientes do parserDetalhe
        this._conexaoRMO = conexaoRMO; // Instância do RmoInterceptor
    }

    render() {
        const T = this._uiFacade.templates;
        const root = document.createElement('div');
        
        // Exemplo de aba de Atividades Técnicas (Estrutura simplificada para abstração)
        let atividadesHTML = T.emptyState("Nenhuma atividade registrada.");
        if (this._dadosART.atividadesTecnicas && this._dadosART.atividadesTecnicas.length > 0) {
            atividadesHTML = `<div>${this._dadosART.atividadesTecnicas.length} atividades identificadas.</div>`;
        }

        // Exemplo de aba Outros (Onde os botões de injeção habitam)
        const idBtnProp = `btn-inj-prop-${Date.now()}`;
        const outrosHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>Proprietário:</strong> ${this._dadosART.obra.proprietario || "N/A"}
                ${this._uiFacade.createIconButton({ icon: '📌', id: idBtnProp, tooltip: 'Preencher na RMO', size: '16px' }).outerHTML}
            </div>
        `;

        const view1 = document.createElement('div'); view1.innerHTML = atividadesHTML;
        const view2 = document.createElement('div'); view2.innerHTML = outrosHTML; view2.style.display = 'none';

        const tabs = this._uiFacade.createTabs({
            items: [
                { label: "Atividades", active: true, onClick: () => { view1.style.display='block'; view2.style.display='none'; } },
                { label: "Outros", active: false, onClick: () => { view1.style.display='none'; view2.style.display='block'; } }
            ]
        });

        root.appendChild(tabs);
        root.append(view1, view2);

        // Bind events dos botões internos gerados acima
        const btnInjetar = root.querySelector(`#${idBtnProp}`);
        if (btnInjetar) btnInjetar.onclick = () => this._injetarDadosProprietario();

        return root;
    }

    _injetarDadosProprietario() {
        const payload = {
            proprietario: { proprietario: this._dadosART.obra.proprietario, cpfCnpj: this._dadosART.obra.documentoLimpo }
        };
        const sucesso = this._conexaoRMO.setDadosRmo(payload);
        if (sucesso) this._uiFacade.toast.success("Proprietário injetado na RMO!");
        else this._uiFacade.toast.error("Falha ao conectar com o Angular da RMO.");
    }

    _inserirNovoEnvolvido(tipo, dados) {
        const sucesso = this._conexaoRMO.adicionarEnvolvido(dados, 'nome');
        if (sucesso) this._uiFacade.toast.success(`Envolvido (${tipo}) adicionado.`);
    }
}

/**
 * @class CardResultado
 * @description Representa um item da lista. Agrega um DetalhesCardResultado (Composição).
 */
class CardResultado {
    /**
     * @param {Object} dadosART - DTO básico proveniente do parse da Lista.
     * @param {Object} dependencias - Injeção das libs necessárias para as ações de rede e UI.
     */
    constructor(dadosART, dependencias) {
        this._dadosART = dadosART;
        this._uiFacade = dependencias.uiFacade;
        this._commBridge = dependencias.commBridge;
        this._creaHelper = dependencias.creaHelper;
        
        this._detalhesAbertos = false;
        this._detalhesInstancia = null; // Type: DetalhesCardResultado
        
        this._cardElement = null; // A âncora DOM deste card
    }

    render() {
        const T = this._uiFacade.templates;
        const rootHTML = `
            ${T.keyValue("Proprietário:", this._dadosART.proprietario || "N/A")}
            <div style="margin-top: 8px; border-top: 1px solid rgba(128,128,128,0.25); display: flex; justify-content: space-between; align-items: center; padding-top: 8px;">
                <div style="font-size: 13px; color: var(--th-text-muted);">📍 ${this._dadosART.endereco}</div>
                ${this._uiFacade.createIconButton({ icon: 'ℹ', id: `btn-det-${this._dadosART.numeroART}`, tooltip: 'Ver Detalhes', size: '16px' }).outerHTML}
            </div>
            <div class="card-detalhes-ancora" style="display: none; margin-top: 10px; border-top: 1px dashed rgba(128,128,128,0.25); padding-top: 10px;"></div>
        `;

        this._cardElement = this._uiFacade.createCard({ title: this._dadosART.numeroART, html: rootHTML, variant: 'success' });
        
        const btnDetalhes = this._cardElement.querySelector(`#btn-det-${this._dadosART.numeroART}`);
        btnDetalhes.onclick = () => this._handleToggleDetalhes(btnDetalhes);

        return this._cardElement;
    }

    abrirFecharDetalhes() {
        this._detalhesAbertos = !this._detalhesAbertos;
        const container = this._cardElement.querySelector('.card-detalhes-ancora');
        container.style.display = this._detalhesAbertos ? 'block' : 'none';
        
        const btnDetalhes = this._cardElement.querySelector(`#btn-det-${this._dadosART.numeroART}`);
        if (btnDetalhes) btnDetalhes.innerHTML = this._detalhesAbertos ? '▲' : 'ℹ';
    }

    async _handleToggleDetalhes(botao) {
        // Padrão Lazy Load: Instancia DetalhesCardResultado apenas uma vez
        if (!this._detalhesInstancia) {
            botao.innerHTML = '⏳';
            try {
                // Utiliza a dependência de rede injetada para buscar os detalhes
                const html = await this._commBridge.apiART.fetchText(this._dadosART.urlImpressao);
                const dadosProfundos = this._creaHelper.parser.parseDetalhe(html);
                
                // Aplica a Composição: cria a instância dependente
                this._detalhesInstancia = new DetalhesCardResultado(this._uiFacade, dadosProfundos, this._creaHelper.rmo);
                
                const container = this._cardElement.querySelector('.card-detalhes-ancora');
                container.appendChild(this._detalhesInstancia.render());
            } catch (err) {
                botao.innerHTML = '❌';
                this._uiFacade.toast.error("Falha ao baixar detalhes da ART.");
                return;
            }
        }
        this.abrirFecharDetalhes();
    }
}

/**
 * @class PainelBuscaControle
 * @description O Coordenador da View (UIManager). Controla os estados macro da tela.
 */
class PainelBuscaControle {
    constructor(app, uiFacade) {
        this._app = app;
        this._uiFacade = uiFacade;
        this._painelBusca = null; // Type: ConteinerFormulariosBusca
        this._conteinerResultados = null; // Type: HTMLElement
        this._resultados = []; // Type: [CardResultado]
    }

    construirPainel(listaModos) {
        if (document.getElementById('caca-art-painel')) return;

        const callbacks = {
            onSearch: (modo, dados) => this._app.handleIniciarBusca({ modo, ...dados }),
            onCancel: () => this._app.handleInterromperBusca()
        };

        this._painelBusca = new ConteinerFormulariosBusca(this._uiFacade, callbacks);
        
        listaModos.forEach(modo => this._painelBusca.addModo(modo));
        
        this._conteinerResultados = this._painelBusca.render();
    }

    bloquearInputs(isRodando) {
        if (this._painelBusca) this._painelBusca.setStatusCarregando(isRodando);
    }

    atualizarStatusBusca(msg, tipo) {
        if (!this._conteinerResultados) return;
        
        this._conteinerResultados.querySelectorAll('.pts-status-box').forEach(el => el.remove());
        const statusBox = this._uiFacade.createStatusBox(this._conteinerResultados, msg, tipo);
        statusBox.mount('afterbegin'); // Monta no início da div de resultados
    }

    renderizarResultados(listaArts, dependencias) {
        listaArts.forEach(dados => this.addResultado(dados, dependencias));
    }

    addResultado(dados, dependencias) {
        const card = new CardResultado(dados, dependencias);
        this._resultados.push(card);
        this._conteinerResultados.appendChild(card.render());
    }

    limparResultados() {
        this._resultados = [];
        if (this._conteinerResultados) {
            this._conteinerResultados.innerHTML = '';
        }
    }
}