function plugin() {
  return {
    order: 5,
    name: 'ipCountry',
    module: '',
    execute: async (input, globals) => {
      try {
        let geoData = JSON.parse(await globals.redis.get(`ipCountry - ${input.ip}`));
        if (!geoData) {
          const geoResponse = await fetch(`https://ipapi.co/${input.ip}/json/`);
          geoData = await geoResponse.json();
          await globals.redis.set(`ipCountry - ${input.ip}`, JSON.stringify(geoData), { EX: 3600 });
        }
        return !geoData.error && geoData.country_name === "US";
        
      } catch (error) {
        globals.logger.error('Error executing ipCountry plugin', error);
        return false;
      }
    }
  };
}

export default plugin;
