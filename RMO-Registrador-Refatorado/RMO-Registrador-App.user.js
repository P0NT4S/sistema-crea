// ==UserScript==
// @name         RMO Registrador (V2 - Arquitetura POO)
// @namespace    https://github.com/P0NT4S/
// @version      6.1.0
// @description  Painel de registro e edição de RMOs. Reescrito em arquitetura POO/MVC com camadas Domain, Service, GUI e Controller.
// @author       P0nt4s
// @match        https://mobile.creadf.org.br/sgf_web_21/www/*
// @updateURL    https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Registrador-Refatorado/RMO-Registrador-App.user.js
// @downloadURL  https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Registrador-Refatorado/RMO-Registrador-App.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_openInTab
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/UIFactory.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/Utils.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/CreaHelper.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/CommBridge.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Registrador-Refatorado/RMO-Registrador-Domain.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Registrador-Refatorado/RMO-Registrador-Service.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Registrador-Refatorado/RMO-Registrador-GUI.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/RMO-Registrador-Refatorado/RMO-Registrador-Controller.js
// @resource     P0nt4sTheme https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/P0nt4sTheme.css
// ==/UserScript==

(function () {
    'use strict';

    /* ==========================================================================
       INJEÇÃO DO DESIGN SYSTEM (P0nt4sTheme)
       ========================================================================== */
    const themeCss = typeof GM_getResourceText !== 'undefined' ? GM_getResourceText('P0nt4sTheme') : '';

    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(themeCss);
    } else {
        const styleEl = document.createElement('style');
        styleEl.textContent = themeCss;
        document.head.appendChild(styleEl);
    }

    /* ==========================================================================
       BOOTSTRAP (STARTUP POINT)
       ========================================================================== */

    // Flag protetora: impede execução múltipla caso o match capture iframes filhos
    let isInitialized = false;

    /**
     * Instancia as dependências em ordem e delega o controle ao Controller.
     * Segue o mesmo padrão de bootstrap do Busca-ART-Refatorado.
     */
    function startApp() {
        if (isInitialized) return;

        // Verifica se as classes brutas das Libs foram carregadas via @require
        if (typeof CoreUtils === 'undefined' || typeof UIFacade === 'undefined' ||
            typeof CommBridge === 'undefined' || typeof CreaHelper === 'undefined') {
            console.error('[RmoRegistrador] Erro Crítico: Uma ou mais Libs não foram carregadas. Verifique os @require.');
            return;
        }

        // Instanciação das dependências em ordem (respeitando a cadeia de injeção)
        const appUtils = new CoreUtils({ logName: 'RmoRegistrador' });
        const appUIFactory = new UIFacade(appUtils);
        const appCommBridge = new CommBridge(appUtils, appUIFactory);
        const appCreaHelper = new CreaHelper(appUtils);

        // Registra o RmoInterceptor no CreaHelper para que o Controller possa acessá-lo
        appUtils.crea = appCreaHelper;

        isInitialized = true;
        appUtils.log.success('App', 'Injeção de dependências POO concluída.');

        // Inicializa o ThemeManager para aplicar a preferência de tema salva
        if (typeof ThemeManager !== 'undefined') ThemeManager.init();

        // Integração com o Painel de Configurações Global
        window.addEventListener('P0NT4S_ConfigUpdate', (e) => {
            const conf = e.detail;
            if (conf) {
                appUtils.log.info("ConfigSync", "Recebendo configurações globais do Painel.", conf);

                try {
                    // Aplica Modo Teste na bridge local
                    appCommBridge.definirModoTeste(conf.modoTeste);

                    // Aplica Tema Localmente
                    if (conf.tema === 'light') {
                        document.documentElement.setAttribute('data-theme', 'light');
                        localStorage.setItem('pts_theme_pref', 'light');
                    } else {
                        document.documentElement.removeAttribute('data-theme');
                        localStorage.setItem('pts_theme_pref', 'dark');
                    }

                    // Guarda configurações ativas no Utils para uso futuro (ex: arquivamento)
                    appUtils.configGlobal = conf;

                    if (conf.arquivamentoAuxiliado !== undefined) {
                        appUtils.log.info("ConfigSync", `Contrato de Arquivamento Auxiliado recebido: ${conf.arquivamentoAuxiliado ? 'Ativado' : 'Desativado'}`);
                    }

                    // Responde informando que a execução foi bem sucedida
                    window.dispatchEvent(new CustomEvent('P0NT4S_ConfigAck', {
                        detail: {
                            script: 'RMO-Registrador',
                            status: 'sucesso',
                            contrato: { arquivamentoAuxiliado: conf.arquivamentoAuxiliado }
                        }
                    }));

                } catch (err) {
                    window.dispatchEvent(new CustomEvent('P0NT4S_ConfigAck', {
                        detail: { script: 'RMO-Registrador', status: 'erro', erro: err.message }
                    }));
                }
            }
        });

        // Solicita as configurações ao Painel (caso ele já esteja carregado)
        window.dispatchEvent(new CustomEvent('P0NT4S_RequestConfig'));

        // Monta o pacote de dependências para o Controller
        const dependencias = {
            UIFactory: appUIFactory,
            Utils: appUtils,
            CommBridge: appCommBridge,
            creaHelper: appCreaHelper,
        };

        try {
            const mainController = new RmoRegistradorController(dependencias);
            mainController.inicializar();
        } catch (erro) {
            console.error('[RmoRegistrador] Falha ao inicializar o Controller:', erro);
        }
    }

    // Ouvintes de ciclo de vida: cobre tanto SPAs com carregamento assíncrono
    // quanto páginas com renderização síncrona tradicional
    window.addEventListener('DOMContentLoaded', startApp);
    window.addEventListener('load', startApp);

})();
