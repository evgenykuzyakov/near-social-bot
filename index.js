require("dotenv").config();

const winston = require("winston");

const { loadJson, saveJson } = require("./src/utils");
const OpenAI = require("./src/openai");
const { initNear } = require("./src/near");
const Social = require("./src/social");
const Bot = require("./src/bot");

const StateFilename = "res/" + (process.env.STATE_FILENAME || "state.json");
const DefaultState = {
  accountReplies: {},
  postHistory: [],
  replyHistory: [],
  notifications: [],
  todoNotifications: [],
};

(async () => {
  const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.errors({ stack: true }),
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: `logs/${process.env.LOG_PREFIX}error.log`,
        level: "error",
      }),
      new winston.transports.File({
        filename: `logs/${process.env.LOG_PREFIX}combined.log`,
      }),
    ],
  });

  if (process.env.NODE_ENV !== "production") {
    logger.add(
      new winston.transports.Console({
        format: winston.format.simple(),
      })
    );
  }

  const near = await initNear(logger.child({ type: "near" }));
  const social = new Social(logger.child({ type: "social" }), near);
  const openai = new OpenAI(logger.child({ type: "openai" }));
  const state = Object.assign(DefaultState, loadJson(StateFilename, true));
  const bot = new Bot({ logger, near, social, openai, state });

  // await social.post("Hello world!");
  // const dailyPrompt = logger.info(`Daily prompt`, { prompt: dailyPrompt });
  // console.log(
  //   await openai.reply("Tell me what important events happened on April 20th")
  // );
  // return;

  try {
    await bot.run();
  } catch (error) {
    logger.error(error);
  } finally {
    saveJson(state, StateFilename);
  }
})();
