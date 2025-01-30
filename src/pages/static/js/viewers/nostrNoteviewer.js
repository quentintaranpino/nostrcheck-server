function formatNostrContent(content, pubkeysArray = []) {

    if (!content) return '';

   // Regular expressions for matching media types and line breaks
   const imgRegex = /https?:\/\/[^\s"]+\.(png|jpg|jpeg|gif|webp)/g;
   const videoRegex = /https?:\/\/[^\s"]+\.(mp4|webm|ogg)/g;
   const audioRegex = /https?:\/\/[^\s"]+\.(mp3|wav|ogg)/g;
   const lineBreakRegex = /(?:\r\n|\r|\n)/g;
   const nostrRegex = /nostr:(npub|nprofile|note|naddr1)[a-zA-Z0-9]+/g;

   // Replace image links with <img> tags
   if (content.match(imgRegex)) {
       content = content.replace(imgRegex, `<div class="text-center"><img src="$&" class=" rounded m-3" style="max-width:80%; height:auto" alt="note image"></div>`);
   }

   // Replace video links with <video> tags
   if (content.match(videoRegex)) {
       content = content.replace(videoRegex, `<div class="text-center"><video src="$&" class="rounded m-3" style="max-width:80%; height:auto" controls></video></div>`);
   }

   // Replace audio links with <audio> tags
   if (content.match(audioRegex)) {
       content = content.replace(audioRegex, `<div class="text-center"><audio src="$&" class="rounded" height="200px" controls></audio></div>`);
   }

   // Replace line breaks with <br> tags
   if (lineBreakRegex.test(content)) {
       content = content.replace(lineBreakRegex, '<br>');
   }

   // Remove extra line breaks
   content = content.replace(/<br><br>/g, '<br>');

   // Replace nostr:npub or nostr:nprofile links with <a> tags
   content = content.replace(nostrRegex, (match) => {
       const data = match.split(':')[1];
       if (data.startsWith('npub') || data.startsWith('nprofile')) {
           const decoded = NostrTools.nip19.decode(data);
           pubkeysArray.push({pubkey: decoded.type == 'npub' ? decoded.data : decoded.data.pubkey, data: []});
       }
       return `<a href="https://njump.me/${data}" target="_blank" class="link-offset-2 link-underline link-underline-opacity-0 fw-semibold">${data}</a> <i class="fa-xs text-muted fas fa-external-link-alt me-1"></i> `;
   });

    return content;
}
