const { Configuration, OpenAIApi } = require("openai");
const { encode, decode } = require("gpt-3-encoder");

class OpenAI {
  constructor(logger) {
    this.logger = logger;
    const configuration = new Configuration({
      organization: process.env.OPENAI_ORG,
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);
  }

  limitPromptsTokens(prompts, maxPerPrompt, maxTokens) {
    let remainingTokens = maxTokens;
    return [
      ...prompts
        .slice(0)
        .reverse()
        .map((prompt) => {
          try {
            const tokens = encode(prompt);
            maxPerPrompt = Math.min(maxPerPrompt, remainingTokens);
            if (tokens.length > maxPerPrompt) {
              prompt = decode(tokens.slice(0, maxPerPrompt));
            }
            remainingTokens -= Math.min(tokens.length, remainingTokens);
          } catch (e) {
            this.logger.error("Error truncating prompt", { prompt, e });
            prompt = "";
          }
          return prompt;
        })
        .filter(Boolean)
        .reverse(),
    ];
  }

  async reply(prompts) {
    prompts = Array.isArray(prompts) ? prompts : [prompts];
    prompts.unshift(process.env.AI_COMMAND);
    const maxPromptTokens = parseInt(process.env.MAX_PROMPT_TOKENS) || 512;
    const maxPerPrompt = parseInt(process.env.MAX_TOKENS_PER_PROMPT) || 256;
    prompts = this.limitPromptsTokens(prompts, maxPerPrompt, maxPromptTokens);
    const request = {
      model: process.env.MODEL ?? "gpt-3.5-turbo",
      messages: prompts.map((prompt) => ({
        role: "user",
        content: prompt.replace(process.env.STOP_SEQ, " "),
      })),
      max_tokens: parseInt(process.env.MAX_TOKENS) || 512,
      temperature: 0.9,
      n: 1,
      presence_penalty: 0.6,
    };
    this.logger.info("request", { request });
    const response = await this.openai.createChatCompletion(request);
    this.logger.info("response", { data: response.data });

    return response.data.choices[0].message.content.trim();
  }
}

module.exports = OpenAI;
