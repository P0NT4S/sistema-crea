class ConfiguracoesService {
    constructor(utils) {
        this.utils = utils;
        this.defaultConfig = {
            tema: 'light',
            modoTeste: false,
            arquivamentoAuxiliado: false,
            limitesBusca: {
                endereco: 5,
                contrato: 15,
                profissional: 5,
                documento: 5
            }
        };
        // Carrega configurações persistidas (Fonte da Verdade)
        this.config = this._load();
    }

    _load() {
        if (typeof GM_getValue !== 'undefined') {
            const val = GM_getValue('pts_global_config', null);
            if (val) {
                try {
                    return { ...this.defaultConfig, ...JSON.parse(val) };
                } catch(e) {
                    this.utils.log.warning("ConfigService", "Falha ao dar parse nas configs, usando default.");
                }
            }
        }
        return { ...this.defaultConfig };
    }

    _save() {
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('pts_global_config', JSON.stringify(this.config));
        }
    }

    getConfig() {
        return this.config;
    }

    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        this._save();
        this.broadcastConfig();
    }

    /**
     * Faz o broadcast das configurações atuais para toda a aba,
     * permitindo que outros scripts Tampermonkey sincronizem.
     */
    broadcastConfig() {
        const event = new CustomEvent('P0NT4S_ConfigUpdate', { detail: this.config });
        window.dispatchEvent(event);
        this.utils.log.info("ConfigService", "Configurações transmitidas via CustomEvent.", this.config);
    }
}
