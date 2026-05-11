// ==UserScript==
// @name         Painel de Configurações P0NT4S
// @namespace    https://github.com/P0NT4S/
// @version      2.0.1
// @description  Gerenciador global de configurações (Tema, Modo Teste, Login CREA) sincronizado entre abas/scripts.
// @author       P0nt4s
// @match        https://mobile.creadf.org.br/sgf_web_21/www/*
// @updateURL    https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Painel-Configuracoes/Painel-Configuracoes-App.user.js
// @downloadURL  https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Painel-Configuracoes/Painel-Configuracoes-App.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/UIFactory.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/Utils.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/CommBridge.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/CreaHelper.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Painel-Configuracoes/Painel-Configuracoes-Service.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Painel-Configuracoes/Painel-Configuracoes-GUI.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Painel-Configuracoes/Painel-Configuracoes-Controller.js
// @resource     P0nt4sTheme https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/P0nt4sTheme.css
// ==/UserScript==

(function () {
    'use strict';

    /* ==========================================================================
       INJEÇÃO DO DESIGN SYSTEM (P0nt4sTheme)
       ========================================================================== */
    const themeCss = typeof GM_getResourceText !== "undefined" ? GM_getResourceText("P0nt4sTheme") : "";

    if (typeof GM_addStyle !== "undefined") {
        GM_addStyle(themeCss);
    } else {
        const styleEl = document.createElement('style');
        styleEl.textContent = themeCss;
        document.head.appendChild(styleEl);
    }

    let isInitialized = false;

    function startApp() {
        if (isInitialized) return;

        if (typeof CoreUtils === "undefined" || typeof UIFacade === "undefined") {
            console.error("[Painel Configurações] Libs base não carregadas via @require.");
            return;
        }

        const appUtils = new CoreUtils({ logName: "PainelConfig" });
        const appUIFactory = new UIFacade(appUtils);
        const appCommBridge = new CommBridge(appUtils, appUIFactory);

        // CreaHelper com CommBridge habilita o GerenciadorSessao
        const appCreaHelper = new CreaHelper(appUtils, appCommBridge);

        isInitialized = true;
        appUtils.log.success("Status", "Injeção de bibliotecas concluída para o Painel.");

        if (typeof ThemeManager !== 'undefined') ThemeManager.init();

        const dependencias = {
            Utils: appUtils,
            UIFactory: appUIFactory,
            creaHelper: appCreaHelper
        };

        try {
            const mainController = new ConfiguracoesController(dependencias);
            mainController.inicializar();
        } catch (e) {
            console.error("[Painel Configurações] Falha na arquitetura: ", e);
        }
    }

    window.addEventListener('DOMContentLoaded', startApp);
    window.addEventListener('load', startApp);
})();
