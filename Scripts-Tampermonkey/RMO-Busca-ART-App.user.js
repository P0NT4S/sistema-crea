// ==UserScript==
// @name         RMO Busca ART (V2 - Arquitetura POO)
// @namespace    https://github.com/P0NT4S/
// @version      10.0.0
// @description  Orquestrador de buscas de ART 100% repaginado para arquitetura POO/MVC e Motor Assíncrono isolado.
// @author       P0nt4s
// @match        https://mobile.creadf.org.br/sgf_web_21/www/*
// @updateURL    https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Scripts-Tampermonkey/RMO-Busca-ART-App.user.js
// @downloadURL  https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Scripts-Tampermonkey/RMO-Busca-ART-App.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_openInTab
// @grant        unsafeWindow
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/UIFactory.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/Utils.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/CommBridge.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Busca-ART-Domain.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Busca-ART-Service.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Busca-ART-GUI.js
// @require      https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Busca-ART-Controller.js
// @resource     P0nt4sTheme https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/P0nt4sTheme.css
// ==/UserScript==

(function() {
    'use strict';

    /* ==========================================================================
       INJEÇÃO DO DESIGN SYSTEM (P0nt4sTheme)
       ========================================================================== */
    const themeCss = typeof GM_getResourceText !== "undefined" ? GM_getResourceText("P0nt4sTheme") : "";
    
    // Pequenos ajustes de CSS específicos para o plugin
    const customCss = `
        .art-link-title { font-weight: bold !important; font-family: monospace; font-size: 18px; }
        .input-locked { opacity: 0.6 !important; cursor: not-allowed !important; pointer-events: none !important; background-color: rgba(0,0,0,0.2) !important; }
    `;

    if (typeof GM_addStyle !== "undefined") {
        GM_addStyle(themeCss + customCss);
    } else {
        const styleEl = document.createElement('style');
        styleEl.textContent = themeCss + customCss;
        document.head.appendChild(styleEl);
    }

    /* ==========================================================================
       INICIALIZAÇÃO DO CONTROLLER (STARTUP POINT)
       ========================================================================== */
       
    // Flag protetora para evitar múltiplas execuções no Tampermonkey se o match pegar iframes filhos
    let isInitialized = false;

    function startApp() {
        if (isInitialized) return;

        // Abortamos caso as dependências vitais de injeção (Libs) não tenham sido carregadas via raw content.
        if (!window.Utils || !window.Utils.crea || !window.UIFactory || !window.Comm) {
            console.error("[Caça-ART] Erro Crítico: Bibliotecas base não carregadas remotamente.");
            return;
        }

        isInitialized = true;
        window.Utils.log.init(`Caça ART V2 (Start)`);
        window.Comm.definirModoTeste(true);
        if (window.UIFactory.theme && window.UIFactory.theme.init) window.UIFactory.theme.init();

        // 1. Empacotamos todas as libs base que rodavam aleatóriamente no código espaguete, 
        // a fim de injetá-las uniformemente no ROOT do Controller.
        const appDependencies = {
            UIFactory: window.UIFactory,
            Utils: window.Utils,
            CommBridge: window.Comm,
            creaHelper: window.Utils.crea
        };

        try {
            // 2. Instanciamos e aceleramos a Engine. O Tampermonkey encerrou o escopo dele aqui!
            const mainController = new BuscaARTController(appDependencies);
            mainController.inicializar();
        } catch (e) {
            console.error("[Caça-ART] Falha ao injetar a arquitetura POO: ", e);
        }
    }

    // Ouvintes de ciclo de vida seguro no DOM
    window.addEventListener('DOMContentLoaded', startApp);
    window.addEventListener('load', startApp);

})();
