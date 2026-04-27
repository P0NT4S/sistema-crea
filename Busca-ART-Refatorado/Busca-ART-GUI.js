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
        
        this._esteConteiner = this.panelInstance.getNode().querySelector('#art-results-container');
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

        const tabsObj = this._uiFacade.createTabs(null, itensAba);
        this._tabsNode = tabsObj.getNode();
        
        const panelBody = this.panelInstance.getNode().querySelector('.pts-panel-body') || this.panelInstance.getNode();
        panelBody.insertBefore(this._tabsNode, panelBody.firstChild);
        return this._tabsNode;
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
                if (ativo) el.classList.add('active');
                else el.classList.remove('active');
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
 * @interface AbaDetalheBase
 * @description Contrato base para as abas modulares que serão injetadas dentro de um CardResultado.
 */
class AbaDetalheBase {
    getTituloAba() { throw new Error("Método não implementado"); }
    setDados(dadosProfundos) { throw new Error("Método não implementado"); }
    getNode() { throw new Error("Método não implementado"); }
}

/**
 * @class AbaDetalheAtividades
 * @description Aba concreta responsável por exibir a lista de atividades.
 */
class AbaDetalheAtividades extends AbaDetalheBase {
    constructor(uiFacade) {
        super();
        this._uiFacade = uiFacade;
        this._dados = null;
        this._root = document.createElement('div');
    }

    getTituloAba() { return "Atividades"; }
    
    setDados(dadosProfundos) {
        this._dados = dadosProfundos;
        this.render();
    }

    render() {
        this._root.innerHTML = '';
        
        if (!this._dados.atividadesTecnicas || this._dados.atividadesTecnicas.length === 0) {
            this._root.appendChild(this._uiFacade.createEmptyState(null, "Nenhuma atividade técnica registrada.").getNode());
            return;
        }

        const containerNode = document.createElement('div');
        
        this._dados.atividadesTecnicas.forEach((grupo, idx) => {
            if (grupo && grupo.itens && Array.isArray(grupo.itens)) {
                const titleNode = document.createElement('div');
                titleNode.style.cssText = `font-weight: bold; margin-bottom: 4px; ${idx > 0 ? 'margin-top: 12px;' : ''}`;
                titleNode.innerText = grupo.topico;
                containerNode.appendChild(titleNode);
                
                const listNode = this._uiFacade.createList(null, grupo.itens.map(i => i.descricao));
                containerNode.appendChild(listNode.getNode());
            } else if (typeof grupo === 'string') {
                containerNode.appendChild(this._uiFacade.createDivider(null, grupo, "solid").getNode());
            }
        });

        if (containerNode.childNodes.length > 0) {
            this._root.appendChild(this._uiFacade.createScrollableArea(null, containerNode).getNode());
        } else {
            this._root.appendChild(this._uiFacade.createEmptyState(null, "Nenhuma atividade técnica registrada.").getNode());
        }
    }

    getNode() { return this._root; }
}

/**
 * @class AbaDetalheObservacoes
 * @description Aba para visualização de observações com scroll.
 */
class AbaDetalheObservacoes extends AbaDetalheBase {
    constructor(uiFacade) {
        super();
        this._uiFacade = uiFacade;
        this._dados = null;
        this._root = document.createElement('div');
    }
    getTituloAba() { return "Obs."; }
    setDados(dadosProfundos) { this._dados = dadosProfundos; this.render(); }
    render() {
        this._root.innerHTML = '';
        if (this._dados.observacoes) {
            const content = `<div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Observações</div><div>${this._dados.observacoes}</div>`;
            this._root.appendChild(this._uiFacade.createScrollableArea(null, content).getNode());
        } else {
            this._root.appendChild(this._uiFacade.createEmptyState(null, "Nenhuma observação registrada.").getNode());
        }
    }
    getNode() { return this._root; }
}

/**
 * @class AbaDetalheResponsaveis
 * @description Aba para interações de injeção de Empresa e Profissional.
 */
class AbaDetalheResponsaveis extends AbaDetalheBase {
    constructor(uiFacade, conexaoRMO, utilsCore) {
        super();
        this._uiFacade = uiFacade;
        this._conexaoRMO = conexaoRMO;
        this._utilsCore = utilsCore;
        this._dados = null;
        this._root = document.createElement('div');
    }

    getTituloAba() { return "Resp."; }
    setDados(dadosProfundos) { this._dados = dadosProfundos; this.render(); }

    render() {
        this._root.innerHTML = '';

        // 1. Profissional Responsável
        const profHeader = document.createElement('div');
        profHeader.style.cssText = 'display: flex; justify-content: flex-start; align-items: center; margin-bottom: 4px;';
        profHeader.innerHTML = `<div style="font-weight: bold; font-size: 13px;">Profissional Responsável</div>`;
        const btnEnvProfAnchor = document.createElement('div');
        profHeader.appendChild(btnEnvProfAnchor);
        const btnEnvProf = this._uiFacade.createIconButton(btnEnvProfAnchor, '👤', () => this._inserirNovoEnvolvido("Profissional", { 
            nome: this._dados.responsavel.nome, cpfCnpj: this._utilsCore.text.apenasNumeros(this._dados.responsavel.registro) 
        }), 'Adicionar Profissional como Envolvido', true);
        btnEnvProf.mount();
        this._root.appendChild(profHeader);

        this._root.appendChild(this._uiFacade.createKeyValue(null, "Nome", this._dados.responsavel.nome || "N/A").getNode());
        this._root.appendChild(this._uiFacade.createKeyValue(null, "Título", this._dados.responsavel.titulo || "N/A").getNode());
        
        const regProfLimpo = this._utilsCore.text.apenasNumeros(this._dados.responsavel.registro || "");
        const cpProf = this._uiFacade.createCopyableText(null, this._dados.responsavel.registro || "N/A", regProfLimpo);
        this._root.appendChild(this._uiFacade.createKeyValue(null, "Registro", cpProf).getNode());

        this._root.appendChild(this._uiFacade.createDivider(null, null, "solid").getNode());

        // 2. Empresa Contratada
        const empHeader = document.createElement('div');
        empHeader.style.cssText = 'display: flex; justify-content: flex-start; align-items: center; margin-bottom: 4px;';
        empHeader.innerHTML = `<div style="font-weight: bold; font-size: 13px;">Empresa Contratada</div>`;
        
        if (this._dados.responsavel.empresaContratada && this._dados.responsavel.empresaContratada.nome) {
            const btnEnvEmpAnchor = document.createElement('div');
            empHeader.appendChild(btnEnvEmpAnchor);
            const btnEnvEmp = this._uiFacade.createIconButton(btnEnvEmpAnchor, '🏢', () => this._inserirNovoEnvolvido("Empresa", { 
                nome: this._dados.responsavel.empresaContratada.nome, cpfCnpj: this._utilsCore.text.apenasNumeros(this._dados.responsavel.empresaContratada.registro) 
            }), 'Adicionar Empresa como Envolvida', true);
            btnEnvEmp.mount();
        }
        this._root.appendChild(empHeader);

        if (this._dados.responsavel.empresaContratada && this._dados.responsavel.empresaContratada.nome) {
            this._root.appendChild(this._uiFacade.createKeyValue(null, "Nome", this._dados.responsavel.empresaContratada.nome).getNode());
            
            const regEmpLimpo = this._utilsCore.text.apenasNumeros(this._dados.responsavel.empresaContratada.registro || "");
            const cpEmp = this._uiFacade.createCopyableText(null, this._dados.responsavel.empresaContratada.registro || "N/A", regEmpLimpo);
            this._root.appendChild(this._uiFacade.createKeyValue(null, "Registro", cpEmp).getNode());
        } else {
            const noEmp = document.createElement('div');
            noEmp.style.cssText = 'color:var(--th-text-muted); font-size:13px;';
            noEmp.innerText = "Sem empresa vinculada.";
            this._root.appendChild(noEmp);
        }
    }

    _inserirNovoEnvolvido(tipo, payload) {
        const sucesso = this._conexaoRMO.adicionarEnvolvido(payload, 'nome');
        if (sucesso) this._uiFacade.toast(`Envolvido (${tipo}) adicionado.`, "success");
        else this._uiFacade.toast(`Falha ao injetar ${tipo}.`, "error");
    }

    getNode() { return this._root; }
}

/**
 * @class AbaDetalheOutros
 * @description Aba para Proprietário, CEP, e ARTs Relacionadas.
 */
class AbaDetalheOutros extends AbaDetalheBase {
    constructor(uiFacade, conexaoRMO, dadosART, utilsCore) {
        super();
        this._uiFacade = uiFacade;
        this._conexaoRMO = conexaoRMO;
        this._dadosART = dadosART;
        this._utilsCore = utilsCore;
        this._dados = null;
        this._root = document.createElement('div');
    }

    getTituloAba() { return "Outros"; }
    setDados(dadosProfundos) { this._dados = dadosProfundos; this.render(); }

    render() {
        this._root.innerHTML = '';
        
        const propHeader = document.createElement('div');
        propHeader.style.cssText = 'display: flex; justify-content: flex-start; align-items: center; margin-bottom: 4px;';
        propHeader.innerHTML = `<div style="font-weight: bold; font-size: 13px;">Proprietário da Obra</div>`;
        const btnFillAnchor = document.createElement('div');
        propHeader.appendChild(btnFillAnchor);
        const btnFillProp = this._uiFacade.createIconButton(btnFillAnchor, '📌', () => this._injetarDadosProprietario(), 'Preencher dados na RMO', true);
        btnFillProp.mount();
        this._root.appendChild(propHeader);

        const propValue = this._dados.obra.proprietario || this._dadosART.owner || "N/A";
        this._root.appendChild(this._uiFacade.createKeyValue(null, "Nome", propValue).getNode());

        const docLimpo = this._dados.obra.documentoLimpo;
        const cpDoc = docLimpo ? this._uiFacade.createCopyableText(null, this._dados.obra.documento, docLimpo) : "N/A";
        this._root.appendChild(this._uiFacade.createKeyValue(null, "Doc", cpDoc).getNode());

        this._root.appendChild(this._uiFacade.createDivider(null, null, "solid").getNode());
        
        this._root.appendChild(this._uiFacade.createKeyValue(null, "Finalidade", this._dados.obra.finalidade || "N/A").getNode());

        const cepDisplay = this._dados.contrato.cep || (this._dados.obra.endereco && this._dados.obra.endereco.cep) || "N/A";
        const cepLimpo = this._utilsCore.text.apenasNumeros(cepDisplay);
        const cpCep = cepLimpo ? this._uiFacade.createCopyableText(null, cepDisplay, cepLimpo) : "N/A";
        this._root.appendChild(this._uiFacade.createKeyValue(null, "CEP", cpCep).getNode());

        this._root.appendChild(this._uiFacade.createDivider(null, null, "solid").getNode());

        const artsHeader = document.createElement('div');
        artsHeader.style.cssText = 'font-weight: bold; margin-bottom: 4px; font-size: 13px;';
        artsHeader.innerText = "ARTs Associadas";
        this._root.appendChild(artsHeader);

        if (this._dados.artsRelacionadas && this._dados.artsRelacionadas.length > 0) {
            const listItems = this._dados.artsRelacionadas.map(r => {
                const cpArt = this._uiFacade.createCopyableText(null, r.numero, this._utilsCore.text.apenasNumeros(r.numero)).getNode();
                return `${r.relacao}: ${cpArt.outerHTML}`;
            });
            this._root.appendChild(this._uiFacade.createList(null, listItems).getNode());
        } else {
            const noArts = document.createElement('div');
            noArts.style.cssText = 'color:var(--th-text-muted); font-size:13px;';
            noArts.innerText = "Nenhuma ART associada.";
            this._root.appendChild(noArts);
        }
    }

    _injetarDadosProprietario() {
        if (!this._dados) return;
        const payload = { proprietario: {} };
        const isValido = (v) => v && typeof v === 'string' && v.trim() !== "" && v !== "N/A";

        if (isValido(this._dados.obra.proprietario)) payload.proprietario.proprietario = this._dados.obra.proprietario;
        if (isValido(this._dados.obra.documentoLimpo)) payload.proprietario.cpfCnpj = this._dados.obra.documentoLimpo;
        if (isValido(this._dados.obra.fone)) payload.proprietario.fone = this._dados.obra.fone;
        if (isValido(this._dados.obra.email)) payload.proprietario.email = this._dados.obra.email;

        if (Object.keys(payload.proprietario).length > 0) {
            const sucesso = this._conexaoRMO.setDadosRmo(payload);
            if (sucesso) this._uiFacade.success("📌 Dados do proprietário injetados na RMO!");
            else this._uiFacade.error("Falha ao injetar. A tela da RMO está aberta?");
        } else {
            this._uiFacade.warning("A ART não possui dados válidos de Proprietário para preencher.");
        }
    }

    getNode() { return this._root; }
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
        this._cardElement = null; 
        
        this._abasDetalhes = []; // Array de instâncias AbaDetalheBase (injetadas via composition)
        this._abasJaCarregadas = false;
    }

    addAbaDetalhe(abaInstancia) {
        this._abasDetalhes.push(abaInstancia);
    }

    render() {
        const rootContent = document.createElement('div');
        
        // 1. Label Proprietário/Contratante
        const propLabel = this._dadosART.contratanteName ? "Contratante:" : "Proprietário:";
        const propValue = this._dadosART.contratanteName || this._dadosART.owner || "N/A";
        const kvNode1 = this._uiFacade.createKeyValue(null, propLabel, propValue);
        rootContent.appendChild(kvNode1.getNode());

        // 2. Linha flexível com Doc e Data
        let docNode = '⏳...';
        if (this._dadosART.docFormatado) {
            docNode = this._uiFacade.createCopyableText(null, this._dadosART.docFormatado, this._dadosART.docLimpo);
        }
        
        const kvDoc = this._uiFacade.createKeyValue(null, "Doc:", docNode);
        const kvData = this._uiFacade.createKeyValue(null, "Data:", this._dadosART.dataRegistro || "N/A");
        const rowDados = this._uiFacade.createFlexRow(null, [kvDoc, kvData]);
        rootContent.appendChild(rowDados.getNode());

        // 3. Endereço e Botão de Detalhes
        const rowDiv = document.createElement('div');
        rowDiv.style.cssText = "margin-top: 8px; border-top: 1px solid rgba(128,128,128,0.25); display: flex; justify-content: space-between; align-items: flex-end; padding-top: 8px; gap: 8px;";
        rowDiv.innerHTML = `<div style="font-size: 13px; color: var(--th-text-light); line-height: 1.4; flex: 1;">📍 ${this._dadosART.address || "N/A"}</div>`;
        rootContent.appendChild(rowDiv);
        
        const btnAnchor = document.createElement('div');
        rowDiv.appendChild(btnAnchor);
        const btnDetalhesObj = this._uiFacade.createIconButton(btnAnchor, 'ℹ', () => this._handleToggleDetalhes(btnDetalhesObj), 'Ver Detalhes');
        btnDetalhesObj.mount();

        // 4. Ancora para Detalhes (Lazy Load)
        const containerDetalhes = document.createElement('div');
        containerDetalhes.className = 'card-detalhes-ancora';
        containerDetalhes.style.cssText = "display: none; margin-top: 10px; border-top: 1px dashed rgba(128,128,128,0.25); padding-top: 10px;";
        rootContent.appendChild(containerDetalhes);

        // --- Montagem do Card ---
        const cardObj = this._uiFacade.createCard(null, { title: this._dadosART.artNum, content: rootContent, variant: 'success', closeButton: true });
        this._cardElement = cardObj.getNode();
        
        // 5. Ajustes de Cabeçalho (Link, Download, Badge)
        const header = this._cardElement.querySelector('.pts-card-header');
        const titleSpan = this._cardElement.querySelector('.pts-card-title');
        if (header && titleSpan) {
            titleSpan.innerHTML = `<a href="${this._dadosART.url}" target="_blank" class="pts-link art-link-title">${this._dadosART.artNum}</a>`;
            
            const btnDownload = this._uiFacade.createIconButton(null, '📥', async () => {
                try {
                    btnDownload.getNode().innerHTML = ' ⏳';
                    btnDownload.getNode().style.pointerEvents = 'none';

                    const rmoIdExtraido = this._creaHelper.rmo.getDadosRmo('geral')?.id;
                    if (!rmoIdExtraido) {
                        this._uiFacade.error("Erro: Não foi possível identificar o ID da RMO nesta tela para o download.");
                        throw new Error("ID da RMO não encontrado.");
                    }

                    await this._commBridge.apiLocal.baixarPdfArt(rmoIdExtraido, this._dadosART.artNum, this._dadosART.url);

                    this._uiFacade.success(`Download da ART ${this._dadosART.artNum} finalizado!`);
                    btnDownload.getNode().innerHTML = ' ✅';
                    btnDownload.getNode().title = "ART Baixada";
                } catch (e) {
                    btnDownload.getNode().innerHTML = ' ❌';
                    if (e.message !== "ID da RMO não encontrado.") this._uiFacade.error(`Falha ao baixar ART ${this._dadosART.artNum}.`);
                    setTimeout(() => {
                        btnDownload.getNode().innerHTML = ' 📥';
                        btnDownload.getNode().style.pointerEvents = 'auto';
                    }, 3000);
                }
            }, "Baixar PDF da ART");
            
            btnDownload.getNode().classList.add('pts-btn-inline');
            
            const badge = this._uiFacade.createBadge(null, "COMPATÍVEL", "success", "ghost");
            
            // Agrupa Título, Botão e Badge para o flexbox 'space-between' empurrar apenas o botão de fechar para a direita
            const titleGroup = document.createElement('div');
            titleGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';
            header.insertBefore(titleGroup, titleSpan);
            titleGroup.appendChild(titleSpan);
            titleGroup.appendChild(btnDownload.getNode());
            titleGroup.appendChild(badge.getNode());
        }

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
        if (!this._abasJaCarregadas) {
            botaoObjFacade.setIcon('⏳');
            try {
                const html = await this._commBridge.apiART.fetchText(this._dadosART.url);
                const dadosProfundos = this._creaHelper.parser.parseDetalhe(html);
                
                // Distribui os dados para as abas instanciadas e as renderiza
                this._abasDetalhes.forEach(aba => aba.setDados(dadosProfundos));
                
                const containerDetalhesDOM = this._cardElement.querySelector('.card-detalhes-ancora');
                
                const itensAba = this._abasDetalhes.map((aba, index) => {
                    const node = aba.getNode();
                    node.style.display = index === 0 ? 'block' : 'none'; // A primeira nasce aberta
                    
                    return {
                        label: aba.getTituloAba(),
                        active: index === 0,
                        onClick: () => {
                            this._abasDetalhes.forEach(a => a.getNode().style.display = 'none');
                            node.style.display = 'block';
                        }
                    };
                });

                const tabsNode = this._uiFacade.createTabs(null, itensAba).getNode();
                containerDetalhesDOM.appendChild(tabsNode);
                
                // Injeta as views logo abaixo do controlador visual das abas
                this._abasDetalhes.forEach(aba => containerDetalhesDOM.appendChild(aba.getNode()));
                
                this._abasJaCarregadas = true;
            } catch (err) {
                console.error(err);
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

    renderizarResultadosProntos(cardsProntos) {
        cardsProntos.forEach(card => {
            this._resultados.push(card);
            this._conteinerResultados.appendChild(card.render());
        });
    }

    limparResultados() {
        this._resultados = [];
        if (this._conteinerResultados) this._conteinerResultados.innerHTML = '';
    }
}