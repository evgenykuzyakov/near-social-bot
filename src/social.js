const { NearConfig } = require("./near");

const innerValue = (key, data) => {
  if (data) {
    const parts = key.split("/");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === "*" || part === "**") {
        break;
      }
      data = data?.[part];
    }
  }
  return data;
};

class Social {
  constructor(logger, near) {
    this.logger = logger;
    this.near = near;
  }

  async set(data) {
    return this.near.functionCall(
      NearConfig.contractName,
      "set",
      {
        data: {
          [this.near.accountId]: data,
        },
      },
      undefined,
      "1"
    );
  }

  async post(text) {
    return this.set({
      post: {
        main: JSON.stringify({ type: "md", text }),
      },
      index: {
        post: JSON.stringify({
          key: "main",
          value: {
            type: "md",
          },
        }),
      },
    });
  }

  async comment(item, text, mentions, notifyAccountId) {
    const commentItem = {
      type: "social",
      path: `${this.near.accountId}/post/comment`,
    };

    const notifications = mentions.map((accountId) => ({
      key: accountId,
      value: {
        type: "mention",
        item: commentItem,
      },
    }));

    if (notifyAccountId) {
      notifications.push({
        key: notifyAccountId,
        value: {
          type: "comment",
          item,
        },
      });
    }

    const data = {
      post: {
        comment: JSON.stringify({ item, text, type: "md" }),
      },
      index: {
        comment: JSON.stringify({
          key: item,
          value: {
            type: "md",
          },
        }),
      },
    };

    if (notifications.length) {
      data.index.notify = JSON.stringify(
        notifications.length > 1 ? notifications : notifications[0]
      );
    }

    return this.set(data);
  }

  async index(action, key, options) {
    const response = await fetch(`${NearConfig.apiUrl}/index`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        key,
        options,
      }),
    });
    const ok = response.ok;
    return ok ? await response.json() : undefined;
  }

  async get(keys, blockId) {
    return this.near.viewCall(
      NearConfig.contractName,
      "get",
      {
        keys: Array.isArray(keys) ? keys : [keys],
      },
      blockId
    );
  }

  async keys(keys, blockId, options) {
    return this.near.viewCall(
      NearConfig.contractName,
      "keys",
      {
        keys: Array.isArray(keys) ? keys : [keys],
        options,
      },
      blockId
    );
  }

  async keysInner(key, blockId, options) {
    return innerValue(key, await this.keys(key, blockId, options));
  }

  async getInner(key, blockId) {
    return innerValue(key, await this.get(key, blockId));
  }

  async isFollowing(accountId, targetId) {
    return (
      Object.keys(
        (await this.get(`${accountId}/graph/follow/${targetId}`)) || {}
      ).length > 0
    );
  }

  async follow(accountId) {
    this.logger.info("follow", { accountId });
    return this.set({
      graph: {
        follow: {
          [accountId]: "",
        },
      },
      index: {
        notify: JSON.stringify({
          key: accountId,
          value: {
            type: "follow",
          },
        }),
      },
    });
  }

  async poke(accountId) {
    this.logger.info("poke", { accountId });
    return this.set({
      index: {
        graph: JSON.stringify({
          key: "poke",
          value: {
            accountId: accountId,
          },
        }),
        notify: JSON.stringify({
          key: accountId,
          value: {
            type: "poke",
          },
        }),
      },
    });
  }

  async getPost(item, type = "main") {
    try {
      if (!item || item?.type !== "social") {
        return null;
      }
      let { blockHeight, path } = item;
      if (!blockHeight || !path) {
        return null;
      }
      blockHeight = parseInt(blockHeight);
      if (!blockHeight) {
        return null;
      }
      const accountId = path.split("/")[0];
      if (`${accountId}/post/${type}` !== path) {
        return null;
      }
      let data = await this.getInner(path, blockHeight);
      if (!data) {
        return null;
      }
      data = JSON.parse(data);
      return {
        accountId,
        blockHeight,
        path,
        data,
        type,
      };
    } catch (error) {
      this.logger.debug("getPost", { error });
      return null;
    }
  }

  async getComment(item) {
    return this.getPost(item, "comment");
  }

  async getCommentFromIndex(item) {
    try {
      const { blockHeight, accountId } = item;
      const path = `${accountId}/post/comment`;
      let data = await this.getInner(path, blockHeight);
      if (!data) {
        return null;
      }
      data = JSON.parse(data);
      return {
        accountId,
        blockHeight,
        path,
        data,
      };
    } catch (error) {
      this.logger.debug("getCommentFromIndex", { error });
      return null;
    }
  }
}

module.exports = Social;
