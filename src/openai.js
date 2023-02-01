const {Configuration, OpenAIApi} = require("openai");

async function reply(prompt) {
  const configuration = new Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  const request = {
    "model": "text-davinci-003",
    "prompt": process.env.AI_COMMAND + process.env.STOP_SEQ + prompt.replace(process.env.STOP_SEQ, " "),
    "stop": process.env.STOP_SEQ,
    "max_tokens": 256,
    "temperature": 0.9,
    "n": 1,
    "presence_penalty": 0.6,
  };
  // console.log(request);
  const response = await openai.createCompletion(request);
  console.log(response.data);

  return response.data.choices[0].text.trimStart();
}

module.exports = reply;
