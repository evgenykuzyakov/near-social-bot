const { NearConfig } = require("./near");

class Social {
  constructor(near) {
    this.near = near;
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
}

module.exports = Social;
