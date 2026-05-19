/**
 * @class PainelCredenciais
 * @description Componente de UI isolado, responsável exclusivamente pela coleta
 * de credenciais de acesso aos portais CREA (ART e Corporativo).
 * Expõe uma API assíncrona via Promise — o chamador apenas aguarda o resultado
 * sem precisar conhecer nenhum detalhe de construção de UI.
 *
 * @example
 *   const creds = await new PainelCredenciais(uiFacade).solicitar(portal);
 *   if (creds) console.log(creds.usuario, creds.senha, creds.salvar, creds.portalId);
 */
class PainelCredenciais {
    /**
     * @param {UIFacade} uiFacade - Instância da biblioteca de UI.
     */
    constructor(uiFacade) {
        this._ui = uiFacade;
        this._painel = null;
        this._inputLogin = null;
        this._inputSenha = null;
        this._toggleSalvar = null;
    }

    /**
     * Exibe o painel de credenciais e retorna uma Promise que resolve quando
     * o usuário confirma (com as credenciais) ou cancela (com `null`).
     *
     * @param {Object} portal - Objeto do portal (ex: { id: 'art', nome: 'Portal ART' })
     * @returns {Promise<{usuario: string, senha: string, salvar: boolean, portalId: string}|null>}
     */
    solicitar(portal) {
        return new Promise((resolve) => this._construir(resolve, portal));
    }

    /**
     * Monta o painel usando exclusivamente os componentes do UIFactory.
     * @private
     * @param {Function} resolve - Callback da Promise externa.
     * @param {Object} portal - Portal atual.
     */
    _construir(resolve, portal) {
        this._portal = portal;
        const icone = this._ui.icons.get('PERSON_CIRCLE', { size: '16px', color: 'currentColor' });

        this._painel = this._ui.createPanel({
            id: 'pts-painel-credenciais',
            title: `${icone} Login - ${portal.nome}`,
            width: '300px',
            persist: true,
            draggable: false,
            closeButton: true
        });

        // Intercepta o botão fechar para resolver a Promise e permitir que o script continue
        const btnFechar = this._painel.titleNode.querySelector('.pts-close-btn');
        if (btnFechar) {
            btnFechar.onclick = () => this._cancelar(resolve);
        }

        const corpo = document.createElement('div');
        corpo.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 4px 0;';

        const descricao = document.createElement('p');
        descricao.style.cssText = 'font-size: 13px; color: var(--th-text-light); margin: 0; line-height: 1.5;';
        descricao.innerHTML = `Sessão inativa. Insira as credenciais para login automático em <strong>${portal.nome}</strong>.`;
        corpo.appendChild(descricao);

        this._inputLogin = this._ui.createInput(corpo, 'Usuário', 'Seu usuário CREA', 'text');
        this._inputLogin.mount();

        this._inputSenha = this._ui.createInput(corpo, 'Senha', 'Sua senha', 'password');
        this._inputSenha.mount();

        this._toggleSalvar = this._ui.createToggleButton(corpo, 'Lembrar credenciais', true, null);
        this._toggleSalvar.mount();

        const areaBotoes = document.createElement('div');
        areaBotoes.style.cssText = 'display: flex; justify-content: center; margin-top: 8px;';

        const iconEntrar = this._ui.icons.get('PERSON_BADGE', { color: 'currentColor' });
        const btnEntrar = this._ui.createButton(null, `${iconEntrar} Entrar`, 'success', () => this._confirmar(resolve));

        // Botão maior (padding), centralizado no painel, mas com os textos (ícone+Entrar) à esquerda (flex-start)
        btnEntrar.el.style.cssText = 'padding: 12px 24px; min-width: 65%; display: flex; justify-content: flex-start; align-items: center; gap: 10px; font-size: 14px;';
        btnEntrar.mount(areaBotoes);

        corpo.appendChild(areaBotoes);

        this._painel.setContent(corpo);
        this._painel.mount();
        this._painel.show();

        setTimeout(() => this._inputLogin.el.querySelector('input')?.focus(), 100);

        corpo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._confirmar(resolve);
        });
    }

    /**
     * Valida os campos e resolve a Promise com as credenciais preenchidas.
     * @private
     */
    _confirmar(resolve) {
        const usuario = this._inputLogin.getValue().trim();
        const senha = this._inputSenha.getValue();
        const salvar = this._toggleSalvar.getValue();

        if (!usuario || !senha) {
            if (!usuario) this._inputLogin.el.querySelector('input')?.focus();
            else this._inputSenha.el.querySelector('input')?.focus();
            return;
        }

        this._painel.destroy();
        resolve({ usuario, senha, salvar, portalId: this._portal.id });
    }

    /**
     * Cancela a coleta e resolve a Promise com `null`.
     * @private
     */
    _cancelar(resolve) {
        this._painel.destroy();
        resolve(null);
    }
}

/**
 * @class ConfiguracoesGUI
 * @description Camada de apresentação do painel de configurações globais.
 * Gerencia a UI de configurações (tema, arquivamento, modo teste) e, a partir
 * de v2.0, também a seção de credenciais CREA (login nos portais ART e Corporativo).
 *
 * Protocolo de eventos:
 *  - Escuta `P0NT4S_SolicitarCredenciais` → abre `PainelCredenciais` automaticamente.
 *  - Ao confirmar: dispara `P0NT4S_CredenciaisDefinidas` com as credenciais.
 *  - Ao cancelar: dispara `P0NT4S_CredenciaisCanceladas`.
 */
class ConfiguracoesGUI {
    /**
     * @param {UIFacade}              uiFactory  - Instância da biblioteca de UI.
     * @param {ConfiguracoesController} controller - Controller que gerencia as configs.
     * @param {CreaHelper|null}       creaHelper - Instância do CreaHelper (com sessao disponível).
     */
    constructor(uiFactory, controller, creaHelper = null) {
        this.ui = uiFactory;
        this.controller = controller;
        this.creaHelper = creaHelper;
        this.panel = null;
        this.switches = {};
        this.inputsLimites = {};

        // Escuta solicitações de credenciais de outros scripts
        window.addEventListener('P0NT4S_SolicitarCredenciais', (e) => this._abrirPainelCredenciais(e.detail?.portal));

        this._criarBotaoFab();

        // Verifica a sessão na inicialização para tentar o login automático em background.
        // Se falhar e precisar de credenciais, o `garantirSessoes()` dispara o evento que abrirá a janela.
        this._verificarSessaoNaInicializacao();
    }

    // =========================================================================
    // CICLO DE VIDA
    // =========================================================================

    _criarBotaoFab() {
        const icon = this.ui.icons.get('GEAR', { size: '24px' });
        const fab = this.ui.createFab(
            icon,
            () => this._togglePainel(),
            "Painel de Configurações",
            0  // Base: utilitário de suporte, posição mais baixa
        );
        fab.mount();
    }

    _togglePainel() {
        if (!this.panel) {
            this._criarPainel();
            this.panel.show();
        } else {
            if (this.panel.el.style.display === 'none') {
                this._syncSwitches(this.controller.getConfig());
                this._syncSecaoLogin();
                this.panel.show();
            } else {
                this.panel.hide();
            }
        }
    }

    _criarPainel() {
        const headerIcon = this.ui.icons.get('GEAR', { size: '16px', fill: true, color: 'currentColor' });

        this.panel = this.ui.createPanel({
            title: `${headerIcon} Configurações Globais`,
            compact: true,
            persist: true,
            draggable: false,
            width: "320px"
        }).mount();

        this.panel.setPosition(20, window.innerHeight - 800);
        this.panel.getNode().style.top = 'auto';
        this.panel.getNode().style.bottom = '-5px';
        this.panel.getNode().style.left = '20px';

        const content = document.createElement('div');
        content.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 10px; max-height: 50vh; overflow-y: auto;';

        const configAtual = this.controller.getConfig();

        const criarSwitchRow = (id, labelText, descText, value, onChange, icons = { on: '', off: '' }) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--th-bg-light);';

            const labelContainer = document.createElement('div');
            labelContainer.style.cssText = 'display: flex; flex-direction: column;';

            const label = document.createElement('span');
            label.innerText = labelText;
            label.style.cssText = 'color: var(--th-text); font-weight: bold; font-size: 14px;';

            const desc = document.createElement('span');
            desc.innerText = descText;
            desc.style.cssText = 'color: var(--th-text-light); font-size: 12px;';

            labelContainer.appendChild(label);
            labelContainer.appendChild(desc);

            const toggleBtn = this.ui.createToggleButton(null, '', value, onChange, icons);
            this.switches[id] = toggleBtn;

            row.appendChild(labelContainer);
            row.appendChild(toggleBtn.getNode());
            return row;
        };

        content.appendChild(criarSwitchRow(
            'tema', 'Alternar Tema',
            'Muda a aparência do sistema entre os modos claro e escuro.',
            configAtual.tema === 'dark',
            (isActive) => this.controller.alterarTema(isActive ? 'dark' : 'light'),
            { on: 'MOON_FILL', off: 'SUN_FILL' }
        ));

        content.appendChild(criarSwitchRow(
            'arquivamento', 'Rotina de Arquivamento',
            'Automatiza a etapa de arquivamento após o registro da RMO.',
            configAtual.arquivamentoAuxiliado,
            (isActive) => this.controller.alterarArquivamento(isActive)
        ));

        content.appendChild(criarSwitchRow(
            'modoTeste', 'Modo de Teste',
            'Redireciona requisições de API para ambiente local (Desenvolvedores).',
            configAtual.modoTeste,
            (isActive) => this.controller.alterarModoTeste(isActive)
        ));

        // Seção de limites de páginas
        content.appendChild(this._criarSecaoLimites(configAtual));

        // Seção de credenciais CREA (só renderiza se o CreaHelper estiver disponível)
        if (this.creaHelper && this.creaHelper.sessao) {
            content.appendChild(this._criarSecaoLogin());
        }

        this.panel.setContent(content);
    }

    // =========================================================================
    // SEÇÃO DE LIMITES
    // =========================================================================

    _criarSecaoLimites(configAtual) {
        const secao = document.createElement('div');
        secao.style.cssText = 'display: flex; flex-direction: column; padding-top: 8px;';

        const tituloRow = document.createElement('div');
        tituloRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 4px 0;';

        const tituloContainer = document.createElement('div');
        tituloContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const titulo = document.createElement('span');
        titulo.style.cssText = 'font-weight: bold; font-size: 14px; color: var(--th-text);';
        titulo.innerText = 'Limites de Páginas (Busca-ART)';

        tituloContainer.appendChild(titulo);
        tituloRow.appendChild(tituloContainer);

        const btnToggleAnchor = document.createElement('div');
        tituloRow.appendChild(btnToggleAnchor);

        let isOpen = true;
        const btnToggle = this.ui.createIconButton(
            btnToggleAnchor,
            this.ui.icons.get('CARET_UP_FILL', { color: 'var(--th-text-light)' }),
            null,
            'Recolher'
        );
        btnToggle.mount();

        secao.appendChild(tituloRow);

        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 8px; overflow: hidden;';
        secao.appendChild(contentContainer);

        tituloRow.onclick = () => {
            isOpen = !isOpen;
            contentContainer.style.display = isOpen ? 'flex' : 'none';
            btnToggle.setIcon(this.ui.icons.get(isOpen ? 'CARET_UP_FILL' : 'CARET_DOWN_FILL', { color: 'var(--th-text-light)' }));
            btnToggle.el.title = isOpen ? 'Recolher' : 'Expandir';
        };

        const criarInputRow = (tipo, labelText, descText, value) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--th-bg-light);';

            const labelContainer = document.createElement('div');
            labelContainer.style.cssText = 'display: flex; flex-direction: column; width: 65%;';

            const label = document.createElement('span');
            label.innerText = labelText;
            label.style.cssText = 'color: var(--th-text); font-weight: bold; font-size: 14px;';

            const desc = document.createElement('span');
            desc.innerText = descText;
            desc.style.cssText = 'color: var(--th-text-light); font-size: 12px; line-height: 1.2;';

            labelContainer.appendChild(label);
            labelContainer.appendChild(desc);

            const inputContainer = document.createElement('div');
            inputContainer.style.cssText = 'width: 80px;';
            const inputNum = this.ui.createInput(inputContainer, '', '', 'number');
            inputNum.mount();
            const el = inputNum.el.querySelector('input');
            el.value = value;
            el.min = 1;
            el.style.cssText = 'width: 100%; height: 42px; text-align: center; padding: 4px; font-size: 14px; box-sizing: border-box;';
            el.addEventListener('change', (e) => this.controller.alterarLimiteBusca(tipo, e.target.value));

            this.inputsLimites[tipo] = inputNum;

            row.appendChild(labelContainer);
            row.appendChild(inputContainer);
            return row;
        };

        const limites = configAtual.limitesBusca || { endereco: 5, contrato: 15, profissional: 5, documento: 5 };

        contentContainer.appendChild(criarInputRow('endereco', 'Endereço', 'Páginas verificadas na busca por endereço.', limites.endereco));
        contentContainer.appendChild(criarInputRow('contrato', 'Contrato', 'Páginas verificadas na busca por contrato.', limites.contrato));
        contentContainer.appendChild(criarInputRow('profissional', 'Profissional', 'Páginas verificadas na busca por profissional.', limites.profissional));
        contentContainer.appendChild(criarInputRow('documento', 'Documento', 'Páginas verificadas na busca por CPF/CNPJ.', limites.documento));

        return secao;
    }

    // =========================================================================
    // SEÇÃO DE LOGIN NOS PORTAIS CREA
    // =========================================================================

    /**
     * Constrói a seção de gerenciamento de credenciais dentro do painel de configurações.
     * @private
     * @returns {HTMLElement}
     */
    _criarSecaoLogin() {
        const secao = document.createElement('div');
        secao.id = 'pts-secao-login';
        secao.style.cssText = 'display: flex; flex-direction: column; padding-top: 8px; border-top: 1px solid var(--th-bg-light);';

        const tituloRow = document.createElement('div');
        tituloRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 4px 0;';

        const tituloContainer = document.createElement('div');
        tituloContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const titulo = document.createElement('span');
        titulo.style.cssText = 'font-weight: bold; font-size: 14px; color: var(--th-text);';
        titulo.innerText = 'Login e Sessões';

        tituloContainer.appendChild(titulo);
        tituloRow.appendChild(tituloContainer);

        const btnToggleAnchor = document.createElement('div');
        tituloRow.appendChild(btnToggleAnchor);

        let isOpen = true;
        const btnToggle = this.ui.createIconButton(
            btnToggleAnchor,
            this.ui.icons.get('CARET_UP_FILL', { color: 'var(--th-text-light)' }),
            null,
            'Recolher'
        );
        btnToggle.mount();

        secao.appendChild(tituloRow);

        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 8px; overflow: hidden;';
        secao.appendChild(contentContainer);

        tituloRow.onclick = () => {
            isOpen = !isOpen;
            contentContainer.style.display = isOpen ? 'flex' : 'none';
            btnToggle.setIcon(this.ui.icons.get(isOpen ? 'CARET_UP_FILL' : 'CARET_DOWN_FILL', { color: 'var(--th-text-light)' }));
            btnToggle.el.title = isOpen ? 'Recolher' : 'Expandir';
        };

        // Acessa a lista dinâmica de portais do GerenciadorSessao, se existir
        const portais = (this.creaHelper && this.creaHelper.sessao && this.creaHelper.sessao.constructor.PORTAIS)
            ? this.creaHelper.sessao.constructor.PORTAIS
            : [];

        portais.forEach(portal => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--th-bg-light);';

            const info = document.createElement('div');
            info.style.cssText = 'display: flex; flex-direction: column;';
            const nome = document.createElement('span');
            nome.innerText = portal.nome;
            nome.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--th-text);';
            const desc = document.createElement('span');
            desc.id = `pts-login-usuario-info-${portal.id}`;
            desc.style.cssText = 'font-size: 12px; color: var(--th-text-light);';

            info.appendChild(nome);
            info.appendChild(desc);
            row.appendChild(info);

            if (portal.requerCredenciais) {
                const btnEditar = this.ui.createButton(
                    null,
                    `${this.ui.icons.get('PERSON_BADGE', { color: 'currentColor' })} Editar`,
                    'ghost',
                    () => this._abrirPainelCredenciais(portal)
                );
                btnEditar.el.style.cssText = 'font-size: 12px; padding: 4px 10px;';
                row.appendChild(btnEditar.getNode());
            } else {
                const badge = document.createElement('span');
                badge.innerText = 'Sessão SGF (Aberta)';
                badge.style.cssText = 'font-size: 10px; background: var(--th-bg-light); padding: 2px 6px; border-radius: 4px; color: var(--th-text-light);';
                row.appendChild(badge);
            }

            contentContainer.appendChild(row);
        });

        this._atualizarInfoUsuario();

        return secao;
    }

    /**
     * Atualiza os labels de usuário salvo dentro da seção de login.
     * @private
     */
    _atualizarInfoUsuario() {
        if (!this.creaHelper?.sessao) return;

        const creds = this.creaHelper.sessao.recuperarCredenciais();
        const portais = this.creaHelper.sessao.constructor.PORTAIS || [];

        portais.forEach(portal => {
            const label = document.getElementById(`pts-login-usuario-info-${portal.id}`);
            if (!label) return;

            if (portal.requerCredenciais) {
                const user = creds[portal.id]?.usuario;
                label.innerText = user ? `Usuário salvo: ${user}` : 'Nenhum login salvo.';
            } else {
                label.innerText = 'Injeção automática habilitada.';
            }
        });
    }

    /**
     * Sincroniza a seção de login com os dados atuais do storage.
     * Chamado ao re-abrir o painel.
     * @private
     */
    _syncSecaoLogin() {
        this._atualizarInfoUsuario();
    }

    /**
     * Abre o `PainelCredenciais` para um portal específico.
     * Ao confirmar:
     * - Salva as credenciais via `GerenciadorSessao`
     * - Dispara `P0NT4S_CredenciaisDefinidas` (para scripts aguardando)
     * - Tenta fazer login no portal
     * Ao cancelar, dispara `P0NT4S_CredenciaisCanceladas`.
     * @private
     * @param {Object} portal - Portal a ser editado
     */
    async _abrirPainelCredenciais(portal) {
        if (!portal) return;

        // Evita abrir múltiplos painéis ao mesmo tempo
        if (document.getElementById('pts-painel-credenciais')) return;

        const creds = await new PainelCredenciais(this.ui).solicitar(portal);

        if (!creds) {
            window.dispatchEvent(new CustomEvent('P0NT4S_CredenciaisCanceladas', { detail: { portalId: portal.id } }));
            return;
        }

        // Salva credenciais e notifica outros scripts
        if (this.creaHelper?.sessao) {
            if (creds.salvar) this.creaHelper.sessao.salvarCredenciais(portal.id, creds.usuario, creds.senha);

            window.dispatchEvent(new CustomEvent('P0NT4S_CredenciaisDefinidas', { detail: creds }));

            // Também tenta o login diretamente para este portal
            const sucesso = await this.creaHelper.sessao._logarOndeNecessario({ [portal.id]: false }, creds);
            if (sucesso) {
                this.ui.toast(`Login em ${portal.nome} realizado com sucesso!`, 'success');
            } else {
                this.ui.toast(`Falha ao fazer login em ${portal.nome}. Verifique as credenciais.`, 'error');
            }
        } else {
            window.dispatchEvent(new CustomEvent('P0NT4S_CredenciaisDefinidas', { detail: creds }));
        }

        // Atualiza o label no painel (se estiver aberto)
        this._atualizarInfoUsuario();
    }



    // =========================================================================
    // SYNC DE ESTADO
    // =========================================================================

    /**
     * Tenta garantir a sessão silenciosamente no carregamento.
     * @private
     */
    async _verificarSessaoNaInicializacao() {
        if (!this.creaHelper?.sessao) return;
        // Aguarda a interface carregar para não sobrescrever alertas
        await new Promise(r => setTimeout(r, 1000));
        await this.creaHelper.sessao.garantirSessoes();
        this._atualizarInfoUsuario();
    }

    _syncSwitches(config) {
        if (this.switches.tema) this.switches.tema.setValue(config.tema === 'dark');
        if (this.switches.arquivamento) this.switches.arquivamento.setValue(config.arquivamentoAuxiliado);
        if (this.switches.modoTeste) this.switches.modoTeste.setValue(config.modoTeste);

        if (config.limitesBusca) {
            for (const [tipo, input] of Object.entries(this.inputsLimites)) {
                if (input && input.el) {
                    const el = input.el.querySelector('input');
                    if (el) el.value = config.limitesBusca[tipo];
                }
            }
        }
    }
}
