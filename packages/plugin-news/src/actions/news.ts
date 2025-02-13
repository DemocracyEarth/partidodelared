import {
    ActionExample,
    Content,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@elizaos/core";


export const currentNewsAction: Action = {
    name: "CURRENT_NEWS",
    similes: ["NEWS", "GET_NEWS", "GET_CURRENT_NEWS"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            throw new Error('NEWS_API_KEY environment variable is not set');
        }
        return true;
    },
    description:
        "Obtener las últimas noticias sobre un tema específico si el usuario lo solicita.",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown; },
        _callback: HandlerCallback,
    ): Promise<boolean> => {
        async function getCurrentNews(searchTerm: string) {
            try {
                const enhancedSearchTerm = encodeURIComponent(`"${searchTerm}" AND (Spain OR Spanish OR Madrid OR Felipe)`);

                const [everythingResponse, headlinesResponse] = await Promise.all([
                    fetch(
                        `https://newsapi.org/v2/everything?q=${enhancedSearchTerm}&sortBy=relevancy&language=es&pageSize=50&apiKey=${process.env.NEWS_API_KEY}`
                    ),
                    fetch(
                        `https://newsapi.org/v2/top-headlines?q=${searchTerm}&country=es&language=en&pageSize=50&apiKey=${process.env.NEWS_API_KEY}`
                    )
                ]);

                const [everythingData, headlinesData] = await Promise.all([
                    everythingResponse.json(),
                    headlinesResponse.json()
                ]);

                // Combine and filter articles
                const allArticles = [
                    ...(headlinesData.articles || []),
                    ...(everythingData.articles || [])
                ].filter(article =>
                    article.title &&
                    article.description &&
                    (article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     article.description.toLowerCase().includes(searchTerm.toLowerCase()))
                );

                // Remove duplicates and get up to 15 articles
                const uniqueArticles = Array.from(
                    new Map(allArticles.map(article => [article.title, article])).values()
                ).slice(0, 15);

                if (!uniqueArticles.length) {
                    return "No se encontraron artículos de noticias.";
                }

                return uniqueArticles.map((article, index) => {
                    const content = article.description || 'No content available';
                    const urlDomain = article.url ? new URL(article.url).hostname : '';
                    return [
                        `📰 Artículo ${index + 1}`,
                        '━━━━━━━━━━━━━━━━━━━━━━',
                        `📌 **${article.title || 'Sin título'}**\n`,
                        `📝 ${content}\n`,
                        `🔗 Leer más en: ${urlDomain}`
                    ].join('\n');
                }).join('\n');
            } catch (error) {
                console.error('Error al obtener noticias:', error);
                return 'Lo siento, hubo un error al obtener las noticias.';
            }
        }

        const context = `¿Cuál es el tema o asunto específico sobre el que el usuario quiere noticias? Extrae SOLO el término de búsqueda de este mensaje: "${_message.content.text}". Devuelve solo el término de búsqueda sin texto adicional, puntuación o explicación.`

        const searchTerm = await generateText({
            runtime: _runtime,
            context,
            modelClass: ModelClass.SMALL,
            stop: ["\n"],
        });

        // For debugging
        console.log("Search term extracted:", searchTerm);

        const currentNews = await getCurrentNews(searchTerm);
        const responseText = ` *Ultimas novedades*\n\n${currentNews}`;


        const newMemory: Memory = {
            userId: _message.agentId,
            agentId: _message.agentId,
            roomId: _message.roomId,
            content: {
                text: responseText,
                action: "CURRENT_NEWS_RESPONSE",
                source: _message.content?.source,
            } as Content,
        };

        await _runtime.messageManager.createMemory(newMemory);

        _callback(newMemory.content);
        return true;

    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "¿cuáles son las últimas noticias sobre <searchTerm>?" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "¿puedes mostrarme las últimas noticias sobre <searchTerm>?" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "¿qué hay en las noticias de <searchTerm> hoy?" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "muéstrame los eventos actuales sobre <searchTerm>" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "¿qué está pasando en el mundo de <searchTerm>?" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "dame los últimos titulares sobre <searchTerm>" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "muéstrame las actualizaciones de noticias sobre <searchTerm>" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "¿cuáles son las principales noticias de hoy sobre <searchTerm>?" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "CURRENT NEWS" },
            },
        ],
    ] as ActionExample[][],
} as Action;