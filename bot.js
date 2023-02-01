require("dotenv").config();

const { loadJson, saveJson } = require("./utils");
const reply = require("./src/openai");
const { initNear } = require("./src/near");
const Social = require("./src/social");

const StateFilename = "res/state.json";
const DefaultState = {
  accountReplies: {},
  postHistory: null,
};

(async () => {
  const near = await initNear();
  const social = new Social(near);

  const state = Object.assign(DefaultState, loadJson(StateFilename, true));

  // console.log(await near.viewCall("social.near", "get_node_count", {}));
  console.log(
    await social.index("notify", near.accountId, { order: "desc", limit: 10 })
  );
  // console.log(await reply(prompt));
})();
