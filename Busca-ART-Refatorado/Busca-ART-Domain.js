/* ==========================================================================
   MÓDULO DE DOMÍNIO E ESTRATÉGIAS (Domain Layer)
   Arquitetura: POO / Strategy Pattern
   ========================================================================== */

/**
 * Traduz erros do portal corporativo para mensagens amigáveis em português.
 * @param {Error|Object} err - Erro lançado ou objeto de erro retornado.
 * @returns {string} Mensagem de erro amigável.
 */
function obterFeedbackErroCorporativo(err) {
    if (!err) return "Erro desconhecido ao acessar o Portal Corporativo.";
    const msg = err.message || String(err);
    if (msg.includes("Network Error") || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Falha na conexão de rede")) {
        return "Erro de conexão de rede. Verifique se você está conectado à rede corporativa/intranet do CREA.";
    }
    if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("Tempo de requisição esgotado")) {
        return "Tempo limite de conexão esgotado (Timeout) ao tentar acessar o portal corporativo.";
    }
    if (msg.includes("401") || msg.includes("Unauthorized")) {
        return "Sessão expirada ou não autorizada no Portal Corporativo. Por favor, refaça o login.";
    }
    if (msg.includes("403") || msg.includes("Forbidden")) {
        return "Acesso negado (403) ao Portal Corporativo.";
    }
    if (msg.includes("500") || msg.includes("502") || msg.includes("503")) {
        return "O servidor do Portal Corporativo apresentou instabilidade (Erro 5xx). Tente novamente em instantes.";
    }
    return `Falha no Portal Corporativo: ${msg}`;
}

/**
 * Traduz erros da BrasilAPI para mensagens amigáveis em português.
 * @param {Error|Object} err - Erro lançado ou objeto de erro.
 * @returns {string} Mensagem de erro amigável.
 */
function obterFeedbackErroBrasilAPI(err) {
    if (!err) return "Erro desconhecido ao acessar a BrasilAPI.";
    const msg = err.message || String(err);
    if (msg.includes("Network Error") || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Falha na conexão de rede")) {
        return "Falha de rede ao se comunicar com a BrasilAPI. Verifique sua conexão com a internet.";
    }
    if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("Tempo de requisição esgotado")) {
        return "Tempo limite esgotado ao se comunicar com a BrasilAPI.";
    }
    if (msg.includes("404") || msg.includes("não localizado") || msg.includes("not found")) {
        return "CNPJ não localizado na base de dados da BrasilAPI (Receita Federal).";
    }
    if (msg.includes("400") || msg.includes("invalid") || msg.includes("inválido")) {
        return "Dados inválidos enviados para a BrasilAPI.";
    }
    return `Falha na BrasilAPI: ${msg}`;
}

/**
 * @class EstadoPaginacao
 * @description Mantém o controle de estado e limites do loop de paginação.
 */
class EstadoPaginacao {
    /**
     * @param {number} paginaInicial - Página em que a busca se inicia.
     * @param {number} limiteCiclo - Quantidade de páginas que podem ser varridas no ciclo atual.
     */
    constructor(paginaInicial, limiteCiclo) {
        this.paginaAtual = paginaInicial || 1;
        this.paginaLimite = (this.paginaAtual + limiteCiclo) - 1;
        this.totalPaginas = Infinity;
        this.totalResultados = 0;
        this.isCancelado = false;
    }

    avancar() { this.paginaAtual++; }
    atingiuLimiteDoCiclo() { return this.paginaAtual > this.paginaLimite; }
    atingiuFimAbsoluto() { return this.paginaAtual > this.totalPaginas; }
    abortar() { this.isCancelado = true; }
    podeContinuar() { return !this.isCancelado && !this.atingiuLimiteDoCiclo() && !this.atingiuFimAbsoluto(); }

    atualizarMetadados(totalPaginasDaApi, totalOcorrencias) {
        if (this.totalPaginas === Infinity) {
            this.totalPaginas = totalPaginasDaApi || 1;
            this.totalResultados = totalOcorrencias || 0;
        }
    }
}

/**
 * @interface IFiltroBusca
 * @description Contrato base para qualquer tipo de pesquisa implementada.
 */
class IFiltroBusca {
    construirQueryParams(paginaIndex) { throw new Error("Método não implementado."); }
    /**
     * @param {string} htmlDaPagina - O HTML da página injetado.
     * @param {string} rmoIdAtual - ID da RMO ativo, caso haja.
     * @param {EstadoPaginacao} estadoAtual - Estado injetado (para cancelamento em fetches).
     */
    async processarPagina(htmlDaPagina, rmoIdAtual, estadoAtual) { throw new Error("Método não implementado."); }
}

/**
 * @class FiltroGeralBase
 * @description Fornece a query base repetitiva comum a todos os filtros.
 */
class FiltroGeralBase extends IFiltroBusca {
    _montarParamsBase(paginaIndex) {
        const params = new URLSearchParams();
        params.append('TIPO_ART', 'obra_servico');
        params.append('SIT_ART2', 'REGISTRADA');
        params.append('pg', (paginaIndex - 1).toString());
        params.append('div', 'tela_principal');

        ['NOME_DO_PROPRIETARIO', 'NUMERO_ART', 'NUMERO_ART1025', 'ANO', 'CEP', 'EMPRESA', 'OBSERVACOES', 'data_reg_inicio', 'data_reg_fim']
            .forEach(k => params.append(k, ''));
        return params;
    }
}

/**
 * @class FiltroPorEndereco
 * @description Estratégia dedicada à varredura por cruzamento de strings (Logradouro/Bairro/Filtros Extras).
 */
class FiltroPorEndereco extends FiltroGeralBase {
    /**
     * @param {Object} input - Payload da View ex: {logradouro, bairro, numeros}.
     * @param {Object} dependencias - Injeção das unities { Utils } do sistema-crea.
     */
    constructor(input, dependencias) {
        super();
        this._CommBridge = dependencias.CommBridge;
        this._Utils = dependencias.Utils;

        if (!input.logradouro && !input.bairro) {
            throw new Error("Preencha Logradouro ou Bairro!");
        }

        this.logradouro = input.logradouro.trim();
        this.bairro = input.bairro.trim();
        this.regexList = this._Utils.text.buildHybridRegex(input.numeros || "");
    }

    construirQueryParams(paginaIndex) {
        const params = this._montarParamsBase(paginaIndex);
        params.append('CIDADE', 'Brasília');
        params.append('DESCRICAO_DO_LOGRADOURO', this.logradouro);
        params.append('BAIRRO', this.bairro);
        params.append('CPF_CNPJ_PROP_CONT', '');
        return params;
    }

    async processarPagina(htmlDaPagina, rmoIdAtual, estadoAtual) {
        const extraido = this._Utils.crea.parser.parseLista(htmlDaPagina);
        const matches = [];

        for (let i = 0; i < extraido.arts.length; i++) {
            if (estadoAtual && estadoAtual.isCancelado) break; // Early exit de segurança

            const art = extraido.arts[i];
            if (this._Utils.text.checkAll(art.endereco, this.regexList)) {
                try {
                    const detailHtml = await this._CommBridge.apiART.fetchText(art.urlImpressao);
                    const detalhes = this._Utils.crea.parser.parseDetalhe(detailHtml);
                    matches.push({
                        id: Date.now() + i,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: this._Utils.text.applyHighlight(art.endereco, this.regexList, 'pts-highlight pts-highlight--success'),
                        tipoEndereco: art.tipoEndereco,
                        dataRegistro: art.dataRegistro,
                        docFormatado: detalhes.contrato.documento || detalhes.obra.documento,
                        docLimpo: detalhes.contrato.documentoLimpo || detalhes.obra.documentoLimpo,
                        cacheDetalhes: detalhes
                    });
                } catch (e) {
                    // Fallback
                    matches.push({
                        id: Date.now() + i,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: this._Utils.text.applyHighlight(art.endereco, this.regexList, 'pts-highlight pts-highlight--success'),
                        tipoEndereco: art.tipoEndereco,
                        dataRegistro: art.dataRegistro
                    });
                }
            }
        }

        return { metadados: extraido.metadados, matches };
    }
}

/**
 * @class FiltroPorContrato
 * @description Estratégia de varredura profunda assíncrona. Mergulha nas sub-telas de contrato da ART.
 */
class FiltroPorContrato extends FiltroGeralBase {
    constructor(input, dependencias) {
        super();
        this._Utils = dependencias.Utils;
        this._CommBridge = dependencias.CommBridge; // Requisito exclusivo desta estratégia (acesso a rede)

        const cnpjRaw = input.cnpj && input.cnpj.trim();
        const ctrRaw = input.contrato && input.contrato.trim();

        if (!cnpjRaw || !ctrRaw) throw new Error("Preencha CNPJ e Contrato/Ano!");
        if (ctrRaw.split('/').length !== 2) throw new Error("Formato inválido. Use CONTRATO/ANO.");

        this.cnpjLimpo = this._Utils.text.apenasNumeros(cnpjRaw);
        if (this.cnpjLimpo.length === 0) throw new Error("CNPJ inválido.");

        const parts = ctrRaw.split('/');
        const isYear = s => s.length === 4 && (s.startsWith('19') || s.startsWith('20'));
        this.anoContrato = isYear(parts[0].trim()) ? parts[0].trim() : parts[1].trim();

        const rawNum = isYear(parts[0].trim()) ? parts[1].trim() : parts[0].trim();
        this.numeroContrato = parseInt(rawNum, 10).toString();
        this.regexContrato = new RegExp(`(?<!\\d)0*${this.numeroContrato}(?!\\d)`);
    }

    construirQueryParams(paginaIndex) {
        const params = this._montarParamsBase(paginaIndex);
        params.append('CIDADE', '');
        params.append('DESCRICAO_DO_LOGRADOURO', '');
        params.append('BAIRRO', '');
        params.append('CPF_CNPJ_PROP_CONT', this.cnpjLimpo);
        return params;
    }

    async processarPagina(htmlDaPagina, rmoIdAtual, estadoAtual) {
        const extraido = this._Utils.crea.parser.parseLista(htmlDaPagina);
        const matches = [];

        for (let i = 0; i < extraido.arts.length; i++) {
            // Cancelamento Assíncrono Rápido - Checa se o usuário mandou parar o loop de fetch
            if (estadoAtual && estadoAtual.isCancelado) break;

            const art = extraido.arts[i];
            try {
                // Mergulho profundo (Lazy Fetch nativo da camada de domínio)
                const detailHtml = await this._CommBridge.apiART.fetchText(art.urlImpressao);
                const detalhes = this._Utils.crea.parser.parseDetalhe(detailHtml);

                const checkResult = this._Utils.crea.parser.checkContractDeep(detalhes, this.anoContrato, this.regexContrato);

                if (checkResult.match) {
                    let formattedAddress = "Contrato validado internamente.";
                    if (checkResult.foundText === "Campo Contrato") {
                        formattedAddress = `Contrato: ${detalhes.contrato.numeroContrato}`;
                    } else if (checkResult.foundText === "Campo Observações") {
                        let obs = detalhes.observacoes || "";
                        const indexAno = obs.indexOf(this.anoContrato);
                        let snippet = obs;
                        if (indexAno !== -1) {
                            const start = Math.max(0, indexAno - 20);
                            const end = Math.min(obs.length, indexAno + this.anoContrato.length + 20);
                            snippet = obs.substring(start, end);
                            if (start > 0) snippet = "..." + snippet;
                            if (end < obs.length) snippet = snippet + "...";
                        } else if (obs.length > 80) {
                            snippet = obs.substring(0, 80) + "...";
                        }
                        const highlighted = this._Utils.text.applyHighlight(snippet, [this.regexContrato, new RegExp(this.anoContrato, 'g')], 'pts-highlight pts-highlight--success');
                        formattedAddress = `Obs: ${highlighted}`;
                    }

                    matches.push({
                        id: Date.now() + i, artNum: art.numeroART, owner: art.proprietario,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        contratanteName: detalhes.contrato.contratante || art.proprietario,
                        address: formattedAddress, extraInfo: checkResult.foundText,
                        tipoEndereco: art.tipoEndereco,
                        dataRegistro: art.dataRegistro,
                        docFormatado: detalhes.contrato.documento || detalhes.obra.documento,
                        docLimpo: detalhes.contrato.documentoLimpo || detalhes.obra.documentoLimpo,
                        cacheDetalhes: detalhes // Guarda cache das infos estendidas
                    });
                }
            } catch (e) {
                console.warn(`[FiltroContrato] Erro ao buscar detalhes da ART ${art.numeroART}:`, e);
            }
        }
        return { metadados: extraido.metadados, matches };
    }
}

/**
 * @class FiltroPorDocumento
 * @description Estratégia de busca de CPF/CNPJ em escopo proprietário/contratado.
 */
class FiltroPorDocumento extends FiltroGeralBase {
    constructor(input, dependencias) {
        super();
        this._CommBridge = dependencias.CommBridge;
        this._Utils = dependencias.Utils;

        const docRaw = input.docCpfCnpj && input.docCpfCnpj.trim();
        if (!docRaw) throw new Error("Preencha o CPF ou CNPJ!");

        this.docLimpo = this._Utils.text.apenasNumeros(docRaw);
        if (this.docLimpo.length !== 11 && this.docLimpo.length !== 14) {
            throw new Error("Documento inválido. Deve ter 11 (CPF) ou 14 (CNPJ) dígitos.");
        }

        const endRaw = input.enderecoOpcional && input.enderecoOpcional.trim();
        this.regexEnderecos = this._Utils.text.buildHybridRegex(endRaw || "");
    }

    construirQueryParams(paginaIndex) {
        const params = this._montarParamsBase(paginaIndex);
        params.append('CIDADE', '');
        params.append('DESCRICAO_DO_LOGRADOURO', '');
        params.append('BAIRRO', '');
        params.append('CPF_CNPJ_PROP_CONT', this.docLimpo);
        return params;
    }

    async processarPagina(htmlDaPagina, rmoIdAtual, estadoAtual) {
        const extraido = this._Utils.crea.parser.parseLista(htmlDaPagina);
        const matches = [];

        for (let i = 0; i < extraido.arts.length; i++) {
            if (estadoAtual && estadoAtual.isCancelado) break;

            const art = extraido.arts[i];
            if (this._Utils.text.checkAll(art.endereco, this.regexEnderecos)) {
                try {
                    const detailHtml = await this._CommBridge.apiART.fetchText(art.urlImpressao);
                    const detalhes = this._Utils.crea.parser.parseDetalhe(detailHtml);
                    matches.push({
                        id: Date.now() + i,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: this._Utils.text.applyHighlight(art.endereco, this.regexEnderecos, 'pts-highlight pts-highlight--success'),
                        tipoEndereco: art.tipoEndereco,
                        dataRegistro: art.dataRegistro,
                        docFormatado: detalhes.contrato.documento || detalhes.obra.documento,
                        docLimpo: detalhes.contrato.documentoLimpo || detalhes.obra.documentoLimpo,
                        cacheDetalhes: detalhes
                    });
                } catch (e) {
                    matches.push({
                        id: Date.now() + i,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: this._Utils.text.applyHighlight(art.endereco, this.regexEnderecos, 'pts-highlight pts-highlight--success'),
                        tipoEndereco: art.tipoEndereco,
                        dataRegistro: art.dataRegistro
                    });
                }
            }
        }

        return { metadados: extraido.metadados, matches };
    }
}

/**
 * @class FiltroPorProfissional
 * @description Estratégia que intermedeia o Portal Corporativo para chegar na lista de ARTs.
 */
class FiltroPorProfissional extends FiltroGeralBase {
    constructor(input, dependencias) {
        super();
        this._CommBridge = dependencias.CommBridge;
        this._Utils = dependencias.Utils;

        this.campo = input.campo; // 'registro', 'cpf_cnpj', 'nome'
        this.valor = input.valor;
        this.regexEnderecos = this._Utils.text.buildHybridRegex(input.enderecoOpcional || "");
        
        // Cache da URL final de ARTs após a primeira descoberta
        this._urlArtListBase = null;
    }

    /**
     * Sobrescreve o motor de URL para suportar o salto entre domínios (Mobile -> ART).
     */
    async getOverrideUrl(paginaIndex) {
        if (!this._urlArtListBase) {
            // Passo A: Requisição Inicial (API Corporativa)
            let jsonCorp;
            try {
                jsonCorp = await this._CommBridge.apiART.buscarCorporativo(this.campo, this.valor);
            } catch (e) {
                throw new Error(obterFeedbackErroCorporativo(e));
            }

            if (!jsonCorp || !jsonCorp.resultados || jsonCorp.resultados.length === 0) {
                throw new Error("Nenhum profissional ou empresa localizado com estes dados.");
            }

            // Passo B: Extração do Link (Pega o primeiro hit)
            const linkCorp = jsonCorp.resultados[0].corpLink.replace(/\\/g, '');

            // Passo C: Raspagem em Background
            let htmlCorp;
            try {
                htmlCorp = await this._CommBridge.apiART.fetchText(linkCorp);
            } catch (e) {
                throw new Error(obterFeedbackErroCorporativo(e));
            }

            const linkArt = this._Utils.crea.corp.extrairLinkArt(htmlCorp);
            const perfilDetalhado = this._Utils.crea.corp.extrairPerfil(htmlCorp);
            if (!linkArt) throw new Error("Acesso à página de ARTs não disponível no portal corporativo deste registro.");

            this._urlArtListBase = linkArt;
            this._perfilCorporativo = { ...jsonCorp.resultados[0], ...perfilDetalhado };
            
            if (typeof this.onPerfilEncontrado === 'function') {
                this.onPerfilEncontrado(this._perfilCorporativo);
            }
        }

        // Passo D: Continuação com a URL base extraída + paginação
        const urlObj = new URL(this._urlArtListBase);
        urlObj.searchParams.set('pg', (paginaIndex - 1).toString());
        return urlObj.href;
    }

    construirQueryParams(paginaIndex) {
        return new URLSearchParams(); // Não usado devido ao override
    }

    async processarPagina(htmlDaPagina, rmoIdAtual, estadoAtual) {
        // Reutiliza a lógica de processamento por endereço, já que o usuário quer o filtro opcional
        const extraido = this._Utils.crea.parser.parseLista(htmlDaPagina);
        const matches = [];

        for (let i = 0; i < extraido.arts.length; i++) {
            if (estadoAtual && estadoAtual.isCancelado) break;

            const art = extraido.arts[i];
            // Se não houver regex (filtro vazio), checkAll retorna true por padrão na Lib
            if (this._Utils.text.checkAll(art.endereco, this.regexEnderecos)) {
                try {
                    const detailHtml = await this._CommBridge.apiART.fetchText(art.urlImpressao);
                    const detalhes = this._Utils.crea.parser.parseDetalhe(detailHtml);
                    matches.push({
                        id: Date.now() + i,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: this._Utils.text.applyHighlight(art.endereco, this.regexEnderecos, 'pts-highlight pts-highlight--success'),
                        tipoEndereco: art.tipoEndereco,
                        dataRegistro: art.dataRegistro,
                        docFormatado: detalhes.contrato.documento || detalhes.obra.documento,
                        docLimpo: detalhes.contrato.documentoLimpo || detalhes.obra.documentoLimpo,
                        cacheDetalhes: detalhes
                    });
                } catch (e) {
                    matches.push({
                        id: Date.now() + i,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        artNum: art.numeroART,
                        owner: art.proprietario,
                        address: this._Utils.text.applyHighlight(art.endereco, this.regexEnderecos, 'pts-highlight pts-highlight--success'),
                        tipoEndereco: art.tipoEndereco,
                        dataRegistro: art.dataRegistro
                    });
                }
            }
        }
        return { metadados: extraido.metadados, matches };
    }
}

/**
 * @class FiltroPorNumeroART
 * @description Estratégia de "Ação Direta" para abrir uma ART específica.
 */
class FiltroPorNumeroART extends IFiltroBusca {
    constructor(input, dependencias) {
        super();
        this._CommBridge = dependencias.CommBridge;
        this._Utils = dependencias.Utils;
        this.numeroArt = input.numeroArt.trim();
        if (this.numeroArt.length < 10) throw new Error("Número de ART inválido.");
    }

    async getOverrideUrl() { return 'skip'; }

    construirQueryParams() { return new URLSearchParams(); }

    async processarPagina(htmlDaPagina, rmoIdAtual, estadoAtual) {
        try {
            // 1. Busca o HTML da página de impressão de forma assíncrona (Background Fetch)
            const response = await this._CommBridge.apiART.gerarImpressaoArt(this.numeroArt);
            const html = response.responseText;

            // 2. Utiliza o Parser de Domínio para extrair os dados estruturados
            const detalhes = this._Utils.crea.parser.parseDetalhe(html);
            if (!detalhes || !detalhes.numeroART) throw new Error("ART não localizada ou sem permissão de acesso.");

            // 3. Formata o endereço conforme regra solicitada: logradouro, numero, complemento, bairro, cidade-uf
            const e = detalhes.obra.endereco;
            const partes = [e.logradouro, e.numero, e.complemento, e.bairro].filter(p => p && p.trim() !== "");
            const enderecoFormatado = `${partes.join(", ")}, ${e.cidade}-${e.uf}`;

            // 4. Monta o link para abrir a ART com base nos dados encontrados
            const rnp = this._Utils.text.apenasNumeros(detalhes.responsavel.registro || "");
            const chaveEmpresa = this._Utils.text.apenasNumeros(detalhes.responsavel.empresaContratada?.registro || "");
            
            let urlImpressao = `https://art.creadf.org.br/art1025/funcoes/form_impressao_tos.php?NUMERO_DA_ART=${this.numeroArt}&rnp=${rnp}&chave_empresa_contratada=${chaveEmpresa}`;
            if (rmoIdAtual) {
                urlImpressao += `&rmo_id=${rmoIdAtual}`;
            }

            // 5. Retorna o DTO compatível com a renderização de CardResultado
            return {
                metadados: { totalPaginas: 1, totalOcorrencias: 1, artsNaPagina: 1 },
                matches: [{
                    id: `direct-${this.numeroArt}`,
                    url: urlImpressao,
                    artNum: detalhes.numeroART,
                    owner: detalhes.obra.proprietario,
                    address: enderecoFormatado,
                    dataRegistro: detalhes.dataRegistro,
                    docFormatado: detalhes.contrato.documento || detalhes.obra.documento,
                    docLimpo: detalhes.contrato.documentoLimpo || detalhes.obra.documentoLimpo,
                    cacheDetalhes: detalhes
                }]
            };
        } catch (erro) {
            console.error("[FiltroNumeroART]", erro);
            throw new Error(`Falha ao abrir ART ${this.numeroArt}: ${erro.message}`);
        }
    }
}

/**
 * @class ConsultaEmpresaCnae
 * @description Estratégia para consulta híbrida de Registro CREA + CNAEs.
 */
class ConsultaEmpresaCnae extends IFiltroBusca {
    constructor(input, dependencias) {
        super();
        this._CommBridge = dependencias.CommBridge;
        this._Utils = dependencias.Utils;
        this.cnpj = this._Utils.text.apenasNumeros(input.cnpj);
        if (this.cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos.");
    }

    async getOverrideUrl() { return 'skip'; }

    construirQueryParams() { return new URLSearchParams(); }

    async processarPagina() {
        // Busca CREA Corporativo
        let dataCrea = {};
        let erroCorp = null;
        try {
            dataCrea = await this._CommBridge.apiART.buscarCorporativo('cpf_cnpj', this.cnpj);
        } catch (e) {
            erroCorp = e;
            console.warn("[ConsultaEmpresaCnae] Falha ao buscar no portal corporativo", e);
        }

        // Retry BrasilAPI 3 vezes
        let dataCnae = null;
        let erroBrasil = null;
        for (let i = 1; i <= 3; i++) {
            try {
                const res = await this._CommBridge.apiPublica.consultarCnpj(this.cnpj);
                if (res && res.error) {
                    throw new Error(res.message || "Erro retornado pela BrasilAPI");
                }
                dataCnae = res;
                erroBrasil = null;
                break;
            } catch (e) {
                erroBrasil = e;
                if (i === 3) {
                    console.warn(`[ConsultaEmpresaCnae] BrasilAPI falhou após 3 tentativas.`, e);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        const registroCrea = dataCrea?.resultados && dataCrea.resultados.length > 0 ? dataCrea.resultados[0] : null;

        if (!dataCnae && !registroCrea) {
            const detalheCorp = erroCorp ? obterFeedbackErroCorporativo(erroCorp) : "Nenhum resultado retornado pelo portal corporativo.";
            const detalheBrasil = erroBrasil ? obterFeedbackErroBrasilAPI(erroBrasil) : "Nenhum resultado retornado pela BrasilAPI.";
            throw new Error(`Não foi possível localizar dados da empresa:\n- [CREA]: ${detalheCorp}\n- [BrasilAPI]: ${detalheBrasil}`);
        }

        const razaoSocialFallback = (dataCnae && dataCnae.razao_social) || (registroCrea && registroCrea.nome) || 'Razão Social não identificada';
        const nomeFantasiaFallback = (dataCnae && dataCnae.nome_fantasia) || '';

        return {
            metadados: { totalPaginas: 1, totalOcorrencias: 1, artsNaPagina: 1 },
            matches: [{
                id: 'cnae-result',
                isCnaeCard: true,
                cnpj: this.cnpj,
                razaoSocial: razaoSocialFallback,
                nomeFantasia: nomeFantasiaFallback,
                crea: registroCrea ? { registro: registroCrea.registro, situacao: registroCrea.situacao } : null,
                cnaes: {
                    principal: dataCnae && dataCnae.cnae_fiscal ? { cod: dataCnae.cnae_fiscal, desc: dataCnae.cnae_fiscal_descricao } : null,
                    secundarios: dataCnae ? (dataCnae.cnaes_secundarios || []) : []
                }
            }]
        };
    }
}
