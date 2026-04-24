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

        // Corrigido: Usar container div flexível nativamente ao invés do template HTML morto
        const panelBodyWrapper = document.createElement('div');
        panelBodyWrapper.innerHTML = `
            <div id="forms-container"></div>
            <div id="divider-anchor"></div>
            <div class="my-row" style="margin-top: 10px; display: flex; gap: 15px;">
                <button id="art-btn-search" class="pts-btn pts-btn--primary" style="flex: 1;">🔍 Pesquisar</button>
                <button id="art-btn-cancel" class="pts-btn pts-btn--error" style="display:none; flex: 1;">⛔ Parar Busca</button>
            </div>
            <div id="art-results-container" style="margin-top: 20px;"></div>
        `;

        this.panelInstance = this._uiFacade.createPanel({
            id: 'caca-art-painel', title: "🕵️ Buscar ARTs", width: "550px", draggable: true, persist: true, closeButton: true,
            content: panelBodyWrapper
        });

        // IMPORTANTE: Classes de alto nível precisam do gatilho para nascerem no DOM nativamente
        this.panelInstance.mount();
        this.panelInstance.show();

        // Injeta o divider nativo do UIFactory via Object e faz Mount visual
        const divider = this._uiFacade.createDivider(null, '', 'none');
        const anchor = panelBodyWrapper.querySelector('#divider-anchor');
        anchor.appendChild(divider.getNode());

        const formsContainer = panelBodyWrapper.querySelector('#forms-container');
        this._formularios.forEach(form => formsContainer.appendChild(form.getNode()));
        
        this._construirAbas();
        this._bindEvents();
        this._alternarModo(this._modoAtivo);
        
        this._esteConteiner = this.panelInstance.querySelector('#art-results-container');
        return this._esteConteiner;
    }

    setStatusCarregando(isLoading) {
        this.panelInstance.getNode().querySelector('#art-btn-search').style.display = isLoading ? 'none' : 'flex';
        this.panelInstance.getNode().querySelector('#art-btn-cancel').style.display = isLoading ? 'flex' : 'none';
        
        const formAtivo = this._formularios.find(f => f.getModoID() === this._modoAtivo);
        if (formAtivo) formAtivo.bloquearInputs(isLoading);
    }

    _construirAbas() {
        const itensAba = this._formularios.map(form => ({
            label: form.getTituloAba(),
            active: form.getModoID() === this._modoAtivo,
            onClick: () => this._alternarModo(form.getModoID())
        }));

        const tabs = this._uiFacade.createTabs ? this._uiFacade.createTabs({ items: itensAba }) : this._fallbackAbaHtml(itensAba);
        this._tabsNode = tabs; // Referência para update visual
        
        const panelBody = this.panelInstance.getNode().querySelector('.pts-panel-body') || this.panelInstance.getNode();
        panelBody.insertBefore(tabs, panelBody.firstChild);
        return tabs;
    }
    
    _fallbackAbaHtml(itensAba) {
        const d = document.createElement('div');
        d.style.display = 'flex'; d.style.marginBottom = '15px'; d.style.borderBottom = '1px solid #333';
        d.innerHTML = itensAba.map(i => `<div style="flex:1; text-align:center; padding:10px; cursor:pointer; font-weight:bold; color: ${i.active ? 'var(--th-primary)' : '#666'}; border-bottom: ${i.active ? '2px solid var(--th-primary)' : 'none'}">${i.label}</div>`).join('');
        Array.from(d.children).forEach((el, index) => el.onclick = itensAba[index].onClick);
        return d;
    }

    _alternarModo(modoID) {
        this._modoAtivo = modoID;
        this._formularios.forEach(form => {
            if (form.getModoID() === modoID) form.show();
            else form.hide();
        });

        if (this._tabsNode) {
            Array.from(this._tabsNode.children).forEach((el, index) => {
                const ativo = this._formularios[index].getModoID() === modoID;
                el.style.color = ativo ? 'var(--th-primary)' : '#666';
                el.style.borderBottom = ativo ? '2px solid var(--th-primary)' : 'none';
            });
        }
    }

    _bindEvents() {
        this.panelInstance.getNode().querySelector('#art-btn-search').onclick = () => {
            const formAtivo = this._formularios.find(f => f.getModoID() === this._modoAtivo);
            this._callbacks.onSearch(this._modoAtivo, formAtivo.getValores());
        };
        this.panelInstance.getNode().querySelector('#art-btn-cancel').onclick = () => this._callbacks.onCancel();
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
        const root = document.createElement('div');
        
        let atividadesHTML = `<div style="text-align: center; padding: 16px; color: var(--th-text-muted); font-size: 13px;">Nenhuma atividade registrada.</div>`;
        if (this._dadosART.atividadesTecnicas && this._dadosART.atividadesTecnicas.length > 0) {
            atividadesHTML = `<div>${this._dadosART.atividadesTecnicas.length} atividades identificadas.</div>`;
        }

        const view1 = document.createElement('div'); view1.innerHTML = atividadesHTML;
        const view2 = document.createElement('div'); view2.style.cssText = 'display: none; justify-content: space-between; align-items: center;';
        
        const labelText = document.createElement('span');
        labelText.innerHTML = `<strong>Proprietário:</strong> ${this._dadosART.obra.proprietario || "N/A"}`;
        view2.appendChild(labelText);
        
        // Uso da Instância Nativa de Botão (OOP)
        const btnAnchor = document.createElement('div');
        view2.appendChild(btnAnchor);
        const iconBtn = this._uiFacade.createIconButton(btnAnchor, '📌', () => this._injetarDadosProprietario(), 'Preencher na RMO');
        iconBtn.mount();

        const tabsConfig = {
            items: [
                { label: "Atividades", active: true, onClick: () => { view1.style.display='block'; view2.style.display='none'; } },
                { label: "Outros", active: false, onClick: () => { view1.style.display='none'; view2.style.display='flex'; } }
            ]
        };
        
        const tabs = this._uiFacade.createTabs ? this._uiFacade.createTabs(tabsConfig) : this._fallbackAbaHtml(tabsConfig.items);

        root.appendChild(tabs);
        root.append(view1, view2);

        return root;
    }

    _fallbackAbaHtml(itensAba) {
        const d = document.createElement('div');
        d.style.display = 'flex'; d.style.marginBottom = '15px'; d.style.borderBottom = '1px solid #333';
        d.innerHTML = itensAba.map(i => `<div style="flex:1; text-align:center; padding:10px; cursor:pointer; font-weight:bold; color: ${i.active ? 'var(--th-primary)' : '#666'}; border-bottom: ${i.active ? '2px solid var(--th-primary)' : 'none'}">${i.label}</div>`).join('');
        Array.from(d.children).forEach((el, index) => el.onclick = itensAba[index].onClick);
        return d;
    }

    _injetarDadosProprietario() {
        const payload = {
            proprietario: { proprietario: this._dadosART.obra.proprietario, cpfCnpj: this._dadosART.obra.documentoLimpo }
        };
        const sucesso = this._conexaoRMO.setDadosRmo(payload);
        if (sucesso) this._uiFacade.toast("Proprietário injetado na RMO!", "success");
        else this._uiFacade.toast("Falha ao conectar com o Angular da RMO.", "error");
    }

    _inserirNovoEnvolvido(tipo, dados) {
        const sucesso = this._conexaoRMO.adicionarEnvolvido(dados, 'nome');
        if (sucesso) this._uiFacade.toast(`Envolvido (${tipo}) adicionado.`, "success");
    }
}

/**
 * @class CardResultado
 * @description Representa um item da lista. Agrega um DetalhesCardResultado (Composição).
 */
class CardResultado {
    constructor(dadosART, dependencias) {
        this._dadosART = dadosART;
        this._uiFacade = dependencias.uiFacade;
        this._commBridge = dependencias.commBridge;
        this._creaHelper = dependencias.creaHelper;
        
        this._detalhesAbertos = false;
        this._detalhesInstancia = null; 
        this._cardElement = null; 
    }

    render() {
        const rootContent = document.createElement('div');
        
        const kvNode = document.createElement('div');
        kvNode.innerHTML = `<span class="pts-kv-label" style="font-weight:bold;">Proprietário:</span> <span class="pts-kv-value">${this._dadosART.proprietario || "N/A"}</span>`;
        rootContent.appendChild(kvNode);

        const rowDiv = document.createElement('div');
        rowDiv.style.cssText = "margin-top: 8px; border-top: 1px solid rgba(128,128,128,0.25); display: flex; justify-content: space-between; align-items: center; padding-top: 8px;";
        rowDiv.innerHTML = `<div style="font-size: 13px; color: var(--th-text-muted);">📍 ${this._dadosART.endereco}</div>`;
        rootContent.appendChild(rowDiv);
        
        const btnAnchor = document.createElement('div');
        rowDiv.appendChild(btnAnchor);
        const btnDetalhesObj = this._uiFacade.createIconButton(btnAnchor, 'ℹ', () => this._handleToggleDetalhes(btnDetalhesObj), 'Ver Detalhes');
        btnDetalhesObj.mount();

        const containerDetalhes = document.createElement('div');
        containerDetalhes.className = 'card-detalhes-ancora';
        containerDetalhes.style.cssText = "display: none; margin-top: 10px; border-top: 1px dashed rgba(128,128,128,0.25); padding-top: 10px;";
        rootContent.appendChild(containerDetalhes);

        const cardObj = this._uiFacade.createCard(null, { title: this._dadosART.numeroART, content: rootContent, variant: 'success' });
        this._cardElement = cardObj.getNode();

        return this._cardElement;
    }

    abrirFecharDetalhes() {
        this._detalhesAbertos = !this._detalhesAbertos;
        const container = this._cardElement.querySelector('.card-detalhes-ancora');
        container.style.display = this._detalhesAbertos ? 'block' : 'none';
        
        // Puxa o DOM element real do IconButton e altera apenas seu HTML interno para a "seta"
        const btnNode = this._cardElement.querySelector('.pts-btn-icon');
        if (btnNode) btnNode.innerHTML = this._detalhesAbertos ? '▲' : 'ℹ';
    }

    async _handleToggleDetalhes(botaoObjFacade) {
        if (!this._detalhesInstancia) {
            botaoObjFacade.setIcon('⏳');
            try {
                const html = await this._commBridge.apiART.fetchText(this._dadosART.urlImpressao);
                const dadosProfundos = this._creaHelper.parser.parseDetalhe(html);
                
                this._detalhesInstancia = new DetalhesCardResultado(this._uiFacade, dadosProfundos, this._creaHelper.rmo);
                
                const container = this._cardElement.querySelector('.card-detalhes-ancora');
                container.appendChild(this._detalhesInstancia.render());
            } catch (err) {
                botaoObjFacade.setIcon('❌');
                this._uiFacade.toast("Falha ao baixar detalhes.", "error");
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
        this._painelBusca = null; 
        this._conteinerResultados = null; 
        this._resultados = []; 
    }

    construirPainel(listaModos) {
        if (document.getElementById('caca-art-painel')) {
            this.exibir();
            return;
        }

        const callbacks = {
            onSearch: (modo, dados) => this._app.handleIniciarBusca({ modo, ...dados }),
            onCancel: () => this._app.handleInterromperBusca()
        };

        this._painelBusca = new ConteinerFormulariosBusca(this._uiFacade, callbacks);
        listaModos.forEach(modo => this._painelBusca.addModo(modo));
        
        this._conteinerResultados = this._painelBusca.render();
    }

    toggle() {
        if (this._painelBusca && this._painelBusca.panelInstance) {
            const el = this._painelBusca.panelInstance.getNode();
            if (el.style.display === 'none') {
                this._painelBusca.panelInstance.show();
            } else {
                this._painelBusca.panelInstance.hide();
            }
        } else {
            const el = document.getElementById('caca-art-painel');
            if (el) { 
                if (el.style.display === 'none') {
                    el.style.display = 'flex'; el.style.opacity = '1'; 
                } else {
                    el.style.display = 'none';
                }
            }
        }
    }

    bloquearInputs(isRodando) {
        if (this._painelBusca) this._painelBusca.setStatusCarregando(isRodando);
    }

    atualizarStatusBusca(msg, tipo) {
        if (!this._conteinerResultados) return;
        
        this._conteinerResultados.querySelectorAll('.pts-status-box').forEach(el => el.remove());
        const statusBoxObj = this._uiFacade.createStatusBox(this._conteinerResultados, msg, tipo);
        
        // Uso Seguro e Nativo do DOM sem depender de métodos sujos como 'afterbegin' pro mount OOP
        this._conteinerResultados.insertBefore(statusBoxObj.getNode(), this._conteinerResultados.firstChild);
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
        if (this._conteinerResultados) this._conteinerResultados.innerHTML = '';
    }
}