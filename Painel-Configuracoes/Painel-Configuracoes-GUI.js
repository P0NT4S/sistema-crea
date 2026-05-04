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
        this.panel = this.ui.createPanel({
            title: "Configurações Globais P0NT4S",
            compact: false,
            persist: true,
            width: "320px"
        }).mount();

        // Posiciona no canto inferior direito, perto do FAB
        this.panel.setPosition(window.innerWidth - 350, window.innerHeight - 300);

        const content = document.createElement('div');
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.gap = '10px';
        content.style.padding = '10px';

        const configAtual = this.controller.getConfig();

        // Helper para criar as linhas com checkbox estilizado como switch (básico)
        // Injeta CSS para os toggle buttons
        if (!document.getElementById('pts-switch-style')) {
            const style = document.createElement('style');
            style.id = 'pts-switch-style';
            style.textContent = `
                .pts-switch { position: relative; display: inline-block; width: 40px; height: 22px; margin-left: 10px; flex-shrink: 0; }
                .pts-switch input { opacity: 0; width: 0; height: 0; }
                .pts-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--th-border); transition: .3s; border-radius: 22px; }
                .pts-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: var(--th-bg); transition: .3s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
                .pts-switch input:checked + .pts-slider { background-color: var(--th-primary); }
                .pts-switch input:checked + .pts-slider:before { transform: translateX(18px); }
            `;
            document.head.appendChild(style);
        }

        const criarSwitchRow = (id, labelText, descText, value, onChange) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '8px 0';
            row.style.borderBottom = '1px solid var(--th-border)';

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

            const switchContainer = document.createElement('label');
            switchContainer.className = 'pts-switch';

            const switchBtn = document.createElement('input');
            switchBtn.type = 'checkbox';
            switchBtn.checked = value;
            switchBtn.addEventListener('change', (e) => onChange(e.target.checked));

            const slider = document.createElement('span');
            slider.className = 'pts-slider';

            switchContainer.appendChild(switchBtn);
            switchContainer.appendChild(slider);

            this.switches[id] = switchBtn;

            row.appendChild(labelContainer);
            row.appendChild(switchContainer);
            return row;
        };

        content.appendChild(criarSwitchRow(
            'tema',
            'Modo Escuro',
            'Alternar tema visual das interfaces',
            configAtual.tema === 'dark',
            (checked) => this.controller.alterarTema(checked ? 'dark' : 'light')
        ));

        content.appendChild(criarSwitchRow(
            'modoTeste',
            'Modo de Teste',
            'Redirecionar requisições de ART para localhost',
            configAtual.modoTeste,
            (checked) => this.controller.alterarModoTeste(checked)
        ));

        content.appendChild(criarSwitchRow(
            'arquivamento',
            'Arquivamento Automático',
            'Suporte futuro de arquivamento',
            configAtual.arquivamentoAuto,
            (checked) => this.controller.alterarArquivamento(checked)
        ));

        this.panel.setContent(content);
    }

    _syncSwitches(config) {
        if (this.switches.tema) this.switches.tema.checked = config.tema === 'dark';
        if (this.switches.modoTeste) this.switches.modoTeste.checked = config.modoTeste;
        if (this.switches.arquivamento) this.switches.arquivamento.checked = config.arquivamentoAuto;
    }
}
