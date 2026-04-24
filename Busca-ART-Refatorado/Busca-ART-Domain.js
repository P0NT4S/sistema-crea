/* ==========================================================================
   MÓDULO DE DOMÍNIO E ESTRATÉGIAS (Domain Layer)
   Arquitetura: POO / Strategy Pattern
   ========================================================================== */

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
                matches.push({
                    id: Date.now() + i,
                    url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                    artNum: art.numeroART,
                    owner: art.proprietario,
                    address: this._Utils.text.applyHighlight(art.endereco, this.regexList, 'pts-highlight pts-highlight--success'),
                    dataRegistro: art.dataRegistro
                });
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
                    matches.push({
                        id: Date.now() + i, artNum: art.numeroART, owner: art.proprietario,
                        url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                        contratanteName: detalhes.contrato.contratante || art.proprietario,
                        address: "Contrato validado internamente.", extraInfo: checkResult.foundText,
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
                matches.push({
                    id: Date.now() + i,
                    url: rmoIdAtual ? `${art.urlImpressao}&rmo_id=${rmoIdAtual}` : art.urlImpressao,
                    artNum: art.numeroART,
                    owner: art.proprietario,
                    address: this._Utils.text.applyHighlight(art.endereco, this.regexEnderecos, 'pts-highlight pts-highlight--success'),
                    dataRegistro: art.dataRegistro
                });
            }
        }

        return { metadados: extraido.metadados, matches };
    }
}
