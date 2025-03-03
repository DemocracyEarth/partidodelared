import {
    elizaLogger,
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelProviderName,
    ModelClass,
    generateText,
    generateObject,
} from "@elizaos/core";
import { getArgentinaNews } from "../examples";
import { createNewsClient } from "../services";

interface MessageResponse {
    messageId: number;
    responses: Array<{
        text: string;
        userId: number;
    }>;
}

interface SentimentResult {
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
    analysis: string;
}

interface NewsAnalysis {
    newsId: string;
    title: string;
    source: string;
    url: string;
    description: string;
    summary: string;
    responses: MessageResponse[];
    overallSentiment?: SentimentResult;
}

// Prompts for Claude API
const SUMMARY_PROMPT = `
Eres un asistente especializado en resumir noticias de Argentina de manera neutral y objetiva.
Debes seguir el estilo del Partido de la Red, que presenta información de manera equilibrada.
Genera un resumen conciso y neutral de la siguiente noticia, destacando los puntos clave sin mostrar sesgo político.
El resumen debe ser informativo y fácil de entender para cualquier ciudadano.

Título: {title}
Descripción: {description}
Fuente: {source}

Formato de respuesta:
- Un párrafo principal que resuma la noticia (máximo 3 oraciones)
- 2-3 puntos clave con viñetas
`;

const SENTIMENT_ANALYSIS_PROMPT = `
Eres un analista de sentimiento especializado en evaluar opiniones sobre noticias argentinas.
Analiza las siguientes respuestas a una noticia y determina el sentimiento general.
Evalúa si las opiniones son mayoritariamente positivas, negativas o neutrales.
Proporciona un análisis detallado que explique tu evaluación.

Noticia: {title}

Respuestas:
{responses}

Formato de respuesta (JSON):
{
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": [valor entre 0 y 1],
  "analysis": "Explicación detallada del análisis"
}
`;

const SOCIAL_MEDIA_POST_PROMPT = `
Eres el gestor de redes sociales del Partido de la Red, un movimiento político argentino que promueve la participación ciudadana y la democracia digital.

Siguiendo el estilo del Partido de la Red, debes crear una publicación para redes sociales sobre una noticia reciente.
El estilo debe presentar dos visiones contrapuestas: una desde la perspectiva del trabajo/izquierda y otra desde el capital/derecha, con igual profundidad y respeto.
Evita mostrar preferencia por alguna de las visiones y concluye con una pregunta que invite a la participación.

Noticia: {title}
Resumen: {summary}
Sentimiento general: {sentiment}
URL: {url}

Formato de respuesta:
- Introducción breve a la noticia
- Perspectiva progresista/izquierda
- Perspectiva conservadora/derecha
- Pregunta final para fomentar la participación
- Incluir hashtags relevantes
`;

export const getArgentinaNewsAction: Action = {
    name: "ARGENTINA_NEWS",
    similes: ["ARGENTINA_NEWS", "ARGENTINA_HEADLINES", "ARGENTINA_HEADLINE"],
    description: "Obtiene las noticias de Argentina desde los principales diarios y las publica en Telegram para recolectar opiniones",
    validate: async (runtime: IAgentRuntime) => {
        // Validate Telegram settings
        const telegramGroupId = runtime.getSetting("TELEGRAM_GROUP_ID");
        if (!telegramGroupId) {
            throw new Error("TELEGRAM_GROUP_ID not set in settings");
        }
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback: HandlerCallback
    ) => {
        const newsClient = createNewsClient();
        const telegramClient = runtime.clients?.telegram;
        const twitterClient = runtime.clients?.twitter;

        if (!telegramClient) {
            throw new Error("Telegram client not initialized");
        }

        if (!twitterClient) {
            throw new Error("Twitter client not initialized");
        }

        const telegramGroupId = runtime.getSetting("TELEGRAM_GROUP_ID");
        if (!telegramGroupId) {
            throw new Error("TELEGRAM_GROUP_ID not set in settings");
        }

        try {
            const newsData = await newsClient.getNews();
            elizaLogger.success("News fetched successfully");

            // Get the top 3 news articles
            const topNews = newsData.articles.slice(0, 3);
            const newsAnalysis: NewsAnalysis[] = [];

            // Post each news article to Telegram and ask for opinions
            for (const article of topNews) {
                // Generate summary using Claude API
                const summary = await generateNeutralSummary(runtime, article.title, article.description, article.source);
                
                const message = `📰 *Nueva Noticia de ${article.source}*\n\n${summary}\n\n🔗 ${article.url}\n\n💭 ¿Qué opinan sobre esta noticia? ¿Están de acuerdo o en desacuerdo con la situación presentada? ¡Compartan sus pensamientos!`;

                const sentMessage = await telegramClient.bot.telegram.sendMessage(
                    telegramGroupId,
                    message,
                    { parse_mode: "Markdown" }
                );

                newsAnalysis.push({
                    newsId: article.url,
                    title: article.title,
                    source: article.source,
                    url: article.url,
                    description: article.description,
                    summary: summary,
                    responses: [{
                        messageId: sentMessage.message_id,
                        responses: []
                    }]
                });

                // Wait a bit between messages to avoid flooding
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Schedule sentiment analysis and Twitter posting after 2 hours
            setTimeout(async () => {
                for (const newsItem of newsAnalysis) {
                    try {
                        // Collect responses for each news item
                        const responses = await collectTelegramResponses(telegramClient, telegramGroupId, newsItem.responses[0].messageId);
                        newsItem.responses[0].responses = responses;

                        // Analyze sentiment of responses using Claude API
                        const sentiment = await analyzeSentimentWithClaude(runtime, newsItem.title, responses.map(r => r.text));
                        newsItem.overallSentiment = sentiment;

                        // Generate social media post based on the news and sentiment
                        const socialPost = await generateSocialMediaPost(
                            runtime, 
                            newsItem.title, 
                            newsItem.summary, 
                            sentiment.sentiment, 
                            newsItem.url
                        );

                        // Post to Twitter if there are enough responses
                        if (responses.length >= 3) {
                            await twitterClient.post.tweet(socialPost);
                            elizaLogger.success(`Posted tweet for news: ${newsItem.title}`);
                        } else {
                            // Log the generated post if not enough responses
                            elizaLogger.info(`Generated social post for ${newsItem.title} (not posted due to insufficient responses): ${socialPost}`);
                        }
                    } catch (error) {
                        elizaLogger.error(`Error processing news item ${newsItem.title}:`, error);
                    }
                }
            }, 2 * 60 * 60 * 1000); // 2 hours

            if (callback) {
                callback({
                    text: `He publicado las siguientes noticias en Telegram para recolectar opiniones:\n${topNews.map((article, index) => `${index + 1}. ${article.source}: ${article.title}`).join("\n")}`,
                    data: topNews,
                });
                return true;
            }
        } catch (error) {
            elizaLogger.error("Error fetching news or posting to Telegram", error);
            callback({
                text: "No pude procesar las noticias o publicarlas en Telegram",
                data: error,
            });
            return false;
        }
    },
    examples: getArgentinaNews as ActionExample[][],
} as Action;

async function generateNeutralSummary(
    runtime: IAgentRuntime, 
    title: string, 
    description: string, 
    source: string
): Promise<string> {
    try {
        const prompt = SUMMARY_PROMPT
            .replace('{title}', title)
            .replace('{description}', description)
            .replace('{source}', source);

        const summary = await generateText({
            runtime,
            context: prompt,
            modelClass: ModelClass.MEDIUM,
        });

        return summary.trim();
    } catch (error) {
        elizaLogger.error("Error generating summary with Claude", error);
        // Fallback to simple summary if Claude API fails
        const keyPoints = description.split('.').filter(point => point.trim().length > 0);
        return `${title}\n\nPuntos clave:\n${keyPoints.slice(0, 3).map(point => `• ${point.trim()}`).join('\n')}`;
    }
}

async function collectTelegramResponses(
    telegramClient: any, 
    groupId: string, 
    messageId: number
): Promise<Array<{ text: string; userId: number }>> {
    const replies = await telegramClient.bot.telegram.getMessageThread(groupId, messageId);
    return replies.map(reply => ({
        text: reply.text,
        userId: reply.from.id
    }));
}

async function analyzeSentimentWithClaude(
    runtime: IAgentRuntime, 
    title: string, 
    responses: string[]
): Promise<SentimentResult> {
    try {
        if (responses.length === 0) {
            return { 
                sentiment: 'neutral', 
                confidence: 1.0,
                analysis: "No hay respuestas para analizar" 
            };
        }

        const prompt = SENTIMENT_ANALYSIS_PROMPT
            .replace('{title}', title)
            .replace('{responses}', responses.join('\n\n'));

        // Use a simpler approach without schema validation
        const response = await generateText({
            runtime,
            context: prompt,
            modelClass: ModelClass.MEDIUM,
        });

        // Parse the response manually
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                const result = JSON.parse(jsonStr);
                if (result.sentiment && result.confidence && result.analysis) {
                    return {
                        sentiment: result.sentiment as 'positive' | 'negative' | 'neutral',
                        confidence: result.confidence,
                        analysis: result.analysis
                    };
                }
            }
            
            // If parsing fails, use fallback
            elizaLogger.warn("Failed to parse Claude response as JSON, using fallback");
            return fallbackSentimentAnalysis(responses);
        } catch (parseError) {
            elizaLogger.error("Error parsing Claude response", parseError);
            return fallbackSentimentAnalysis(responses);
        }
    } catch (error) {
        elizaLogger.error("Error analyzing sentiment with Claude", error);
        // Fallback to simple sentiment analysis if Claude API fails
        return fallbackSentimentAnalysis(responses);
    }
}

function fallbackSentimentAnalysis(responses: string[]): SentimentResult {
    // Simple sentiment analysis based on keyword matching
    const positiveWords = ['acuerdo', 'bien', 'positivo', 'excelente', 'favorable', 'apoyo'];
    const negativeWords = ['desacuerdo', 'mal', 'negativo', 'terrible', 'contra', 'rechazo'];

    let positiveCount = 0;
    let negativeCount = 0;

    responses.forEach(response => {
        const lowerResponse = response.toLowerCase();
        positiveWords.forEach(word => {
            if (lowerResponse.includes(word)) positiveCount++;
        });
        negativeWords.forEach(word => {
            if (lowerResponse.includes(word)) negativeCount++;
        });
    });

    const total = responses.length || 1; // Avoid division by zero
    const positiveRatio = positiveCount / total;
    const negativeRatio = negativeCount / total;

    if (positiveRatio > 0.6) {
        return { 
            sentiment: 'positive', 
            confidence: positiveRatio,
            analysis: `Análisis basado en palabras clave: ${positiveCount} menciones positivas vs ${negativeCount} menciones negativas.`
        };
    }
    if (negativeRatio > 0.6) {
        return { 
            sentiment: 'negative', 
            confidence: negativeRatio,
            analysis: `Análisis basado en palabras clave: ${positiveCount} menciones positivas vs ${negativeCount} menciones negativas.`
        };
    }
    return { 
        sentiment: 'neutral', 
        confidence: Math.max(1 - (positiveRatio + negativeRatio), 0.5),
        analysis: `Análisis basado en palabras clave: ${positiveCount} menciones positivas vs ${negativeCount} menciones negativas. No hay una tendencia clara.`
    };
}

async function generateSocialMediaPost(
    runtime: IAgentRuntime, 
    title: string, 
    summary: string, 
    sentiment: string,
    url: string
): Promise<string> {
    try {
        const prompt = SOCIAL_MEDIA_POST_PROMPT
            .replace('{title}', title)
            .replace('{summary}', summary)
            .replace('{sentiment}', sentiment)
            .replace('{url}', url);

        const post = await generateText({
            runtime,
            context: prompt,
            modelClass: ModelClass.MEDIUM,
        });

        return post.trim();
    } catch (error) {
        elizaLogger.error("Error generating social media post with Claude", error);
        // Fallback to simple post if Claude API fails
        const prefix = sentiment === 'positive' ? '👍' : sentiment === 'negative' ? '👎' : '🤔';
        const sentimentText = sentiment === 'positive' ? 'apoya' : sentiment === 'negative' ? 'se opone a' : 'tiene opiniones mixtas sobre';
        return `${prefix} La comunidad ${sentimentText} la noticia: ${title}\n\n${summary}\n\n🔗 ${url}\n\n¿Qué opinas tú? #Argentina #Noticias`;
    }
}