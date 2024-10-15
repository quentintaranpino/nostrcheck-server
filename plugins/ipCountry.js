// This plugin checks if the IP address is from the US. If it is, it returns true, otherwise it returns false.

function plugin() {
    return {
        order: 5,
        enabled: false,
        name: 'ipCountry',
        execute: async (input, globals) => {
          try {
            const geoResponse = await fetch(`https://ipapi.co/${input.ip}/json/`);
            const geoData = await geoResponse.json();
            globals.logger.warn(geoData);
            if (geoData.error) return false;
            if (geoData.country_name != "US") return false;
            return true;
        
          } catch (error) {
            return false;
          }
        }

    };
}

export default plugin;