class ConfiguracoesGUI {
    constructor(uiFactory, controller) {
        this.ui = uiFactory;
        this.controller = controller;
        this.panel = null;
        this.switches = {};

        this._criarBotaoFab();
    }

    _criarBotaoFab() {
        // Icone de engrenagem
        const icon = this.ui.icons.get('GEAR', { size: '24px' });
        const fab = this.ui.createFab(
            icon,
            () => this._togglePainel(),
            "Painel de Configurações"
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

        // Posiciona no canto inferior esquerdo
        this.panel.setPosition(0, window.innerHeight - 300);

        const content = document.createElement('div');
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.gap = '10px';
        content.style.padding = '10px';

        const configAtual = this.controller.getConfig();

        const criarSwitchRow = (id, labelText, descText, value, onChange, icons = { on: '', off: '' }) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '8px 0';
            row.style.borderBottom = '1px solid var(--th-bg-light)';

            const labelContainer = document.createElement('div');
            labelContainer.style.display = 'flex';
            labelContainer.style.flexDirection = 'column';

            const label = document.createElement('span');
            label.innerText = labelText;
            label.style.color = 'var(--th-text)';
            label.style.fontWeight = 'bold';
            label.style.fontSize = '14px';

            const desc = document.createElement('span');
            desc.innerText = descText;
            desc.style.color = 'var(--th-text-light)';
            desc.style.fontSize = '12px';

            labelContainer.appendChild(label);
            labelContainer.appendChild(desc);

            const toggleBtn = this.ui.createToggleButton(
                null,
                '',
                value,
                onChange,
                icons
            );

            this.switches[id] = toggleBtn;

            row.appendChild(labelContainer);
            row.appendChild(toggleBtn.getNode());
            return row;
        };

        content.appendChild(criarSwitchRow(
            'tema',
            'Alternar Tema',
            'Muda a aparência do sistema entre os modos claro e escuro.',
            configAtual.tema === 'dark',
            (isActive) => this.controller.alterarTema(isActive ? 'dark' : 'light'),
            { on: 'MOON_FILL', off: 'SUN_FILL' }
        ));

        content.appendChild(criarSwitchRow(
            'arquivamento',
            'Rotina de Arquivamento',
            'Automatiza a etapa de arquivamento após o registro da RMO.',
            configAtual.arquivamentoAuxiliado,
            (isActive) => this.controller.alterarArquivamento(isActive)
        ));

        content.appendChild(criarSwitchRow(
            'modoTeste',
            'Modo de Teste',
            'Redireciona requisições de API para ambiente local (Desenvolvedores).',
            configAtual.modoTeste,
            (isActive) => this.controller.alterarModoTeste(isActive)
        ));

        this.panel.setContent(content);
    }

    _syncSwitches(config) {
        if (this.switches.tema) this.switches.tema.setValue(config.tema === 'dark');
        if (this.switches.arquivamento) this.switches.arquivamento.setValue(config.arquivamentoAuxiliado);
        if (this.switches.modoTeste) this.switches.modoTeste.setValue(config.modoTeste);
    }
}
