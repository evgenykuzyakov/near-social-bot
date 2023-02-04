const Status = {
  Preparing: "Preparing",
  Posting: "Posting",
  OK: "OK",
};

const postToPrompt = (post) => {
  return post ? `@${post.accountId}: ${post.data?.text || ""}\n` : "";
};

class Bot {
  constructor({ logger, near, social, openai, state }) {
    this.logger = logger;
    this.near = near;
    this.social = social;
    this.openai = openai;
    this.state = state;
  }

  async maybePost() {
    const lastPost =
      this.state.postHistory?.[this.state.postHistory.length - 1];
    const date = new Date();
    if (!lastPost || new Date(lastPost.time).getDay() !== date.getDay()) {
      // Creating a new post
      const post = {
        time: date.getTime(),
        status: Status.Preparing,
      };
      this.state.postHistory.push(post);
      const dateText = date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });
      post.prompt = `Tell me what important events happened on ${dateText}.`;
      this.logger.info(`Generating text for daily prompt`, {
        prompt: post.prompt,
        date,
      });
      post.openaiText = await this.openai.reply(post.prompt);
      post.text = `### ${dateText}\n\n${post.openaiText}`;
      post.status = Status.Posting;
      this.logger.info(`Posting`, {
        post,
      });
      await this.social.post(post.text);
      post.status = Status.OK;
    }
  }

  async fetchNotifications() {
    let from =
      this.state.notifications.length > 0
        ? this.state.notifications[this.state.notifications.length - 1]
            .blockHeight + 1
        : 0;
    const lastCommentBlockHeight = await this.social.keysInner(
      `${this.near.accountId}/post/comment`,
      "optimistic",
      {
        return_type: "BlockHeight",
      }
    );
    if (lastCommentBlockHeight) {
      from = Math.max(from, lastCommentBlockHeight - 60);
    }

    const newNotifications = await this.social.index(
      "notify",
      this.near.accountId,
      {
        order: "asc",
        limit: 10000,
        from,
      }
    );
    if (newNotifications.length > 0) {
      this.logger.info("fetchNotifications", {
        count: newNotifications.length,
        last: newNotifications[newNotifications.length - 1],
      });
      this.state.notifications.push(...newNotifications);
      this.state.todoNotifications.push(...newNotifications);
    }
  }

  async reply({ notification, item, post, blockHeight, accountId }) {
    const lastReplies = (this.state.accountReplies[accountId] =
      this.state.accountReplies[accountId] || []);
    const lastThreeReplies = lastReplies.slice(-3);
    if (
      lastThreeReplies.length === 3 &&
      lastThreeReplies[0].time > Date.now() - 5 * 60 * 1000
    ) {
      // Don't reply more than 3 times 5 minutes
      this.logger.info("Ignoring reply because of rate limit");
      return;
    }
    const postText = postToPrompt(post);
    // Get last comments before this notifications
    const commentsIndex =
      (await this.social.index("comment", item, {
        order: "desc",
        limit: 3,
        from: blockHeight,
      })) || [];
    const comments = await Promise.all(
      commentsIndex
        .reverse()
        .map((item) => this.social.getCommentFromIndex(item))
    );
    this.logger.info("comments", { comments });
    const commentTexts = comments.map((comment) => postToPrompt(comment));
    const prompts = [postText, ...commentTexts].filter((text) => text);
    this.logger.info("prompts", { prompts });
    if (prompts.length === 0) {
      return;
    }
    prompts.push(`@${accountId}, `);

    const stateReply = {
      time: new Date().getTime(),
      item,
      accountId,
      notification,
      prompts,
      postAccountId: post?.accountId,
    };
    lastReplies.push(stateReply);
    this.state.replyHistory.push(stateReply);
    const reply = await this.openai.reply(prompts);
    stateReply.reply = reply;
    this.logger.info("reply", { reply });
    if (!reply) {
      return;
    }
    await this.social.comment(
      item,
      `@${accountId}, ${reply}`,
      [accountId],
      post?.accountId
    );
  }

  async processNotification(notification) {
    this.logger.info("processNotification", { notification });
    const { accountId, blockHeight, value } = notification;
    if (accountId === this.near.accountId) {
      // Ignore self notifications
      return;
    }
    const replies = this.state.accountReplies[accountId] || [];
    const lastReply = replies[replies.length - 1];
    if (lastReply && lastReply.notification.blockHeight === blockHeight) {
      // Ignore duplicate notifications
      return;
    }
    if (value.type === "follow") {
      // Check if they are following us, and we don't follow them yet
      if (
        (await this.social.isFollowing(accountId, this.near.accountId)) &&
        !(await this.social.isFollowing(this.near.accountId, accountId))
      ) {
        this.logger.info("Going to follow back", { accountId });
        await this.social.follow(accountId);
      }
    } else if (value.type === "like") {
      // ignore
    } else if (value.type === "poke") {
      // poke back
      await this.social.poke(accountId);
    } else if (value.type === "comment") {
      const item = value.item;
      // Extract context
      const post = await this.social.getPost(item);
      this.logger.info("comment for post", { post });
      await this.reply({ notification, item, post, blockHeight, accountId });
    } else if (value.type === "mention") {
      const item = value.item;
      let postItem = Object.assign({ blockHeight }, item);
      // Extract context
      let post = await this.social.getPost(postItem);
      if (!post) {
        const comment = await this.social.getComment(postItem);
        if (comment) {
          this.logger.info("mention in a comment", { comment });
          postItem = comment.data?.item;
          post = await this.social.getPost(postItem);
        } else {
          this.logger.info("unknown mention", { item });
          return;
        }
      } else {
        this.logger.info("mention in a post", { post });
      }
      if (!postItem) {
        this.logger.info("unknown post item", { postItem });
        return;
      }
      await this.reply({
        notification,
        item: postItem,
        post,
        blockHeight,
        accountId,
      });
    }
  }

  async processNotifications() {
    while (true) {
      const notification = this.state.todoNotifications.shift();
      if (!notification) {
        return;
      }
      this.state.notifications.push(notification);
      await this.processNotification(notification);
    }
  }

  async run() {
    await this.maybePost();
    await this.fetchNotifications();
    await this.processNotifications();

    // this.state.todoNotifications.shift();
    // this.logger.info("test", {
    //   notification: this.state.todoNotifications[0],
    // });
    // this.state.notifications.map((n, i) => console.log(i, JSON.stringify(n)));
    // await this.processNotification(this.state.notifications.slice(-1)[0]);
  }
}

module.exports = Bot;
