class ConfiguracoesController {
    constructor(deps) {
        this.utils      = deps.Utils;
        this.ui         = deps.UIFactory;
        this.creaHelper = deps.creaHelper || null;

        this.service = new ConfiguracoesService(this.utils);
        this.gui = null; // Instanciado no inicializar()
    }

    inicializar() {
        this.gui = new ConfiguracoesGUI(this.ui, this, this.creaHelper);
        
        // Aplica e propaga as configurações logo ao iniciar (fonte da verdade)
        this._aplicarLocalmenteEPropagar();

        // Escuta os outros scripts que carregam atrasados ou após refresh,
        // pedindo qual é a configuração atual
        window.addEventListener('P0NT4S_RequestConfig', () => {
            this.utils.log.info("Controller", "Recebida requisição de configuração externa. Realizando broadcast...");
            this.service.broadcastConfig();
        });

        // Escuta os avisos de sucesso/falha dos scripts ao aplicarem as configurações
        window.addEventListener('P0NT4S_ConfigAck', (e) => {
            const res = e.detail;
            if (res && res.status === 'sucesso') {
                this.utils.log.success("Controller", `Configuração aplicada com sucesso no script: ${res.script}`);
            } else if (res) {
                this.utils.log.error("Controller", `Falha ao aplicar configuração no script: ${res.script}`, res.erro);
            }
        });
        
        this.utils.log.success("Controller", "Painel de Configurações inicializado e aguardando.");
    }

    getConfig() {
        return this.service.getConfig();
    }

    alterarTema(novoTema) {
        this.service.updateConfig({ tema: novoTema });
        this._aplicarTemaLocal(novoTema);
    }

    alterarModoTeste(isTeste) {
        this.service.updateConfig({ modoTeste: isTeste });
    }

    alterarArquivamento(isArquivamento) {
        this.service.updateConfig({ arquivamentoAuxiliado: isArquivamento });
        this.ui.toast('Configuração de Arquivamento Auxiliado enviada aos scripts.', 'info');
    }

    alterarLimiteBusca(tipo, valor) {
        const num = parseInt(valor, 10);
        if (isNaN(num) || num < 1) return;
        const confAtual = this.service.getConfig();
        const novosLimites = { ...confAtual.limitesBusca, [tipo]: num };
        this.service.updateConfig({ limitesBusca: novosLimites });
    }

    /**
     * Aplica o tema na página e salva em localStorage apenas como fallback
     * para caso o ThemeManager raiz (legacy) dependa dele momentaneamente.
     */
    _aplicarTemaLocal(tema) {
        if (tema === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('pts_theme_pref', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('pts_theme_pref', 'dark');
        }
    }

    _aplicarLocalmenteEPropagar() {
        const conf = this.service.getConfig();
        this._aplicarTemaLocal(conf.tema);
        this.service.broadcastConfig();
    }
}
