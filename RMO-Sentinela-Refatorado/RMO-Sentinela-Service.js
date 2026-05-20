/* ==========================================================================
   MÓDULO DE SERVIÇOS (Service Layer)
   Responsabilidade: Intermediar a comunicação com a API (CommBridge) e
   executar a extração/manipulação de dados estruturados da página web (DOM).
   ========================================================================== */

/**
 * @class RmoSentinelaService
 * @description Classe de serviços especializada no tratamento de dados e consultas do Sentinela.
 */
class RmoSentinelaService {
    /**
     * @param {CommBridge} commBridge - Camada de rede para acesso às APIs.
     * @param {CoreUtils} coreUtils - Utilitários globais do sistema.
     */
    constructor(commBridge, coreUtils) {
        if (!commBridge) throw new Error('[RmoSentinelaService] Instância de CommBridge é obrigatória.');
        if (!coreUtils) throw new Error('[RmoSentinelaService] Instância de CoreUtils é obrigatória.');
        
        this._comm = commBridge;
        this._utils = coreUtils;
        this._log = coreUtils.log;
    }

    /**
     * Varre a tabela de listagem na página, identifica os IDs das RMOs
     * e os insere no modelo de domínio.
     * 
     * @param {string} seletorLinha - Seletor CSS para as linhas da tabela.
     * @param {RmoSentinelaModel} modelo - Instância do modelo de domínio.
     * @returns {boolean} Retorna true se pelo menos uma RMO foi encontrada.
     */
    varrerTabela(seletorLinha, modelo) {
        if (!seletorLinha) throw new Error('[RmoSentinelaService] Seletor de linha é obrigatório.');
        if (!modelo) throw new Error('[RmoSentinelaService] Instância do modelo é obrigatória.');

        modelo.limpar();

        const linhas = document.querySelectorAll(seletorLinha);
        let encontrou = false;

        linhas.forEach(linha => {
            // Regra do legado: Ignora linhas com menos de 2 células (ex: cabeçalhos ou divisores)
            if (linha.cells.length < 2) return;

            const textoLinha = linha.innerText;
            // RegExp de correspondência para código de RMO (Ex: 2026RMO0001)
            const matchId = textoLinha.match(/\d{4}[A-Z]{3}\d{4}/);

            if (matchId) {
                const id = matchId[0];
                modelo.registrarRmoLinha(id, linha);
                linha.dataset.rmoId = id; // Mantém compatibilidade com metadados no HTML
                encontrou = true;
            }
        });

        return encontrou;
    }

    /**
     * Consulta a API Local em lote pelos status das RMOs.
     * 
     * @param {string[]} idsUnicos - Lista de IDs das RMOs a consultar.
     * @returns {Promise<Array<{id_rmo: string, status: string, descricao: string}>>}
     */
    async consultarLoteRmos(idsUnicos) {
        if (!Array.isArray(idsUnicos) || idsUnicos.length === 0) {
            return [];
        }

        this._log.info('Service', `Iniciando consulta em lote para ${idsUnicos.length} RMOs...`);

        try {
            const resposta = await this._comm.apiLocal.consultarLoteRmos(idsUnicos);
            const resultadosObjeto = resposta.resultados || {};

            // Mapeia e higieniza a resposta bruta da API para DTOs padronizados
            return Object.entries(resultadosObjeto).map(([id, dados]) => {
                return {
                    id_rmo: id,
                    status: dados.status,
                    descricao: dados.descricao
                };
            });

        } catch (erro) {
            this._log.error('Service', 'Erro ao consultar lote de RMOs no servidor local.', erro);
            throw erro;
        }
    }
}
