const { Configuration, OpenAIApi } = require("openai");

class OpenAI {
  constructor(logger) {
    this.logger = logger;
    const configuration = new Configuration({
      organization: process.env.OPENAI_ORG,
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);
  }

  async reply(prompts) {
    prompts = Array.isArray(prompts) ? prompts : [prompts];
    prompts.unshift(process.env.AI_COMMAND);
    const request = {
      model: "text-davinci-003",
      prompt: prompts
        .map((prompt) => prompt.replace(process.env.STOP_SEQ, " "))
        .join(`\n${process.env.STOP_SEQ}`),
      stop: process.env.STOP_SEQ,
      max_tokens: parseInt(process.env.MAX_TOKENS) || 512,
      temperature: 0.9,
      n: 1,
      presence_penalty: 0.6,
    };
    this.logger.info("request", { request });
    const response = await this.openai.createCompletion(request);
    this.logger.info("response", { data: response.data });

    return response.data.choices[0].text.trim();
  }
}

module.exports = OpenAI;
