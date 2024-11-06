
// Smooth scroll and offset by 200px
function smoothScroll(target, duration) {

  target == null? target = document.body : target = target;
  const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - 200;
  const startPosition = window.scrollY;
  const distance = targetPosition - startPosition;
  let startTime = null;

  function animation(currentTime) {
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const run = ease(timeElapsed, startPosition, distance, duration);
      window.scrollTo(0, run);
      if (timeElapsed < duration) requestAnimationFrame(animation);
  }

  function ease(t, b, c, d) {
      t /= d / 2;
      if (t < 1) return c / 2 * t * t + b;
      t--;
      return -c / 2 * (t * (t - 2) - 1) + b;
  }

  requestAnimationFrame(animation);
}

// Scroll to hash on page load if exists
window.onload = function() {
    if (window.location.hash) {
        var element = document.querySelector(window.location.hash);
        if (element) {
            element.scrollIntoView();
        }
    }
};

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);
      smoothScroll(targetElement, 1000); 
  });
});

// Reload page when loaded from cache
window.addEventListener('pageshow', (event) => {
  if (event.persisted || (performance && performance.navigation.type === 2)) {
      console.log('Page loaded from cache, reloading...');
      window.location.reload();
  }
});

// Messages engine
const showMessage = (message, messageClass = "alert-warning", persistent = false, timeout = 2500 ) => {
  const messagesContainer = 'message-container';

  if (!document.getElementById(messagesContainer)) {
      $('body').append('<div id="' + messagesContainer + '" class="message-container"></div>');
  }

  const messageBox = 'message-box-' + Date.now();
  const messageBoxHtml = `
      <div id="${messageBox}" class="alert alert-modal mb-2 message-box ${messageClass}">
          ${message}
      </div>
  `;

  const $messagesContainer = $('#' + messagesContainer);
  $messagesContainer.prepend(messageBoxHtml);

  const maxMessages = 5;
  const currentMessages = $messagesContainer.children('.message-box');
  if (currentMessages.length > maxMessages) {
      currentMessages.last().remove();
  }

  if (!persistent) {
    setTimeout(() => {
        $('#' + messageBox).fadeOut(500, function () {
            $(this).remove();
        });
    }, timeout);
    }

    return messageBox;
  
}

const hideMessage = (messageBox, timeout = 2500) => {
    setTimeout(() => {
        $('#' + messageBox).fadeOut(500, function () {
            $(this).remove();
        });
    }, timeout);
}

const updateMessage = (messageBox, newMessage, messageClass) => {
    $('#' + messageBox).html(newMessage);
    if (messageClass) {
        $('#' + messageBox).removeClass().addClass('alert alert-modal mb-2 message-box ' + messageClass);
    }
}

$(window).on('scroll', () => {
    const $messagesContainer = $('#message-container');
    if ($(window).scrollTop() > 800) {
      $messagesContainer.css('top', '10px');
    } else {
      $messagesContainer.css('top', '87px'); 
    }
  });

// Copy to clipboard
const copyToClipboard = async (object, text) => {
    try {
        await navigator.clipboard.writeText(text);
        // Make object blin
        $(object).find('i').removeClass('fa-copy').addClass('fa-check');
        setTimeout(() => {
            $(object).find('i').removeClass('fa-check').addClass('fa-copy');
        }, 2000);
    } catch (err) {
        console.error(`Can't copy text ${err}`);
    }
}


// Logout function
const logout = async () => {
  localStorage.removeItem('profileData')
  window.location.href = 'logout';
}

// Get root host URL
const getRootHost = () => {
    const hostname = window.location.hostname;
    const rootHost = hostname.split('.').slice(-2).join('.');
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${protocol}//${rootHost}${port}`;
}


function getDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length > 2) {
        return parts.slice(-2).join('.');
    }
    return hostname;
}

const getParticles = (selectElement) => {

    try{

        const particles = selectElement? selectElement.value : getComputedStyle(document.documentElement).getPropertyValue('--particles').trim(); 
        if (particles == "quantum") {
            return particlesJS("particles-js", {"particles":{"number":{"value":80,"density":{"enable":true,"value_area":800}},"color":{"value":"#ffffff"},"shape":{"type":"circle","stroke":{"width":0,"color":"#000000"},"polygon":{"nb_sides":5},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":0.5,"random":false,"anim":{"enable":false,"speed":1,"opacity_min":0.1,"sync":false}},"size":{"value":3,"random":true,"anim":{"enable":false,"speed":40,"size_min":0.1,"sync":false}},"line_linked":{"enable":true,"distance":150,"color":"#ffffff","opacity":0.4,"width":1},"move":{"enable":true,"speed":6,"direction":"none","random":false,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":1200}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"grab"},"onclick":{"enable":true,"mode":"push"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":400,"size":40,"duration":2,"opacity":8,"speed":3},"repulse":{"distance":200,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});var count_particles, update; count_particles = document.querySelector('.js-count-particles'); 
        }
        if (particles == "astral") {
            return particlesJS("particles-js", {"particles":{"number":{"value":160,"density":{"enable":true,"value_area":800}},"color":{"value":"#ffffff"},"shape":{"type":"circle","stroke":{"width":0,"color":"#000000"},"polygon":{"nb_sides":5},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":1,"random":true,"anim":{"enable":true,"speed":1,"opacity_min":0,"sync":false}},"size":{"value":3,"random":true,"anim":{"enable":false,"speed":4,"size_min":0.3,"sync":false}},"line_linked":{"enable":false,"distance":150,"color":"#ffffff","opacity":0.4,"width":1},"move":{"enable":true,"speed":1,"direction":"none","random":true,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":600}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"bubble"},"onclick":{"enable":false,"mode":"repulse"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":250,"size":0,"duration":2,"opacity":0,"speed":3},"repulse":{"distance":400,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});var count_particles, stats, update; stats = new Stats; stats.setMode(0); stats.domElement.style.position = 'absolute'; stats.domElement.style.left = '0px'; stats.domElement.style.top = '0px'; document.body.appendChild(stats.domElement); count_particles = document.querySelector('.js-count-particles'); update = function() { stats.begin(); stats.end(); if (window.pJSDom[0].pJS.particles && window.pJSDom[0].pJS.particles.array) { count_particles.innerText = window.pJSDom[0].pJS.particles.array.length; } requestAnimationFrame(update); }; requestAnimationFrame(update);;
        }
        if (particles == "nexus") {
            return particlesJS("particles-js", {"particles":{"number":{"value":6,"density":{"enable":true,"value_area":800}},"color":{"value":"#1b1e34"},"shape":{"type":"polygon","stroke":{"width":0,"color":"#000"},"polygon":{"nb_sides":6},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":0.3,"random":true,"anim":{"enable":false,"speed":1,"opacity_min":0.1,"sync":false}},"size":{"value":160,"random":false,"anim":{"enable":true,"speed":10,"size_min":40,"sync":false}},"line_linked":{"enable":false,"distance":200,"color":"#ffffff","opacity":1,"width":2},"move":{"enable":true,"speed":8,"direction":"none","random":false,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":1200}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"grab"},"onclick":{"enable":false,"mode":"push"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":400,"size":40,"duration":2,"opacity":8,"speed":3},"repulse":{"distance":200,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});var count_particles, stats, update; stats = new Stats; stats.setMode(0); stats.domElement.style.position = 'absolute'; stats.domElement.style.left = '0px'; stats.domElement.style.top = '0px'; document.body.appendChild(stats.domElement); count_particles = document.querySelector('.js-count-particles'); update = function() { stats.begin(); stats.end(); if (window.pJSDom[0].pJS.particles && window.pJSDom[0].pJS.particles.array) { count_particles.innerText = window.pJSDom[0].pJS.particles.array.length; } requestAnimationFrame(update); }; requestAnimationFrame(update);;
        }
        
        // None
        return particlesJS("particles-js", {"particles":{"number":{"value":0,"density":{"enable":true,"value_area":0}},"color":{"value":"#ffffff"},"shape":{"type":"circle","stroke":{"width":0,"color":"#000000"},"polygon":{"nb_sides":5},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":1,"random":true,"anim":{"enable":true,"speed":1,"opacity_min":0,"sync":false}},"size":{"value":3,"random":true,"anim":{"enable":false,"speed":4,"size_min":0.3,"sync":false}},"line_linked":{"enable":false,"distance":150,"color":"#ffffff","opacity":0.4,"width":1},"move":{"enable":true,"speed":1,"direction":"none","random":true,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":600}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"bubble"},"onclick":{"enable":false,"mode":"repulse"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":250,"size":0,"duration":2,"opacity":0,"speed":3},"repulse":{"distance":400,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});var count_particles, stats, update; stats = new Stats; stats.setMode(0); stats.domElement.style.position = 'absolute'; stats.domElement.style.left = '0px'; stats.domElement.style.top = '0px'; document.body.appendChild(stats.domElement); count_particles = document.querySelector('.js-count-particles'); update = function() { stats.begin(); stats.end(); if (window.pJSDom[0].pJS.particles && window.pJSDom[0].pJS.particles.array) { count_particles.innerText = window.pJSDom[0].pJS.particles.array.length; } requestAnimationFrame(update); }; requestAnimationFrame(update);;

    } catch (error) {
        
    }
}
getParticles();

/**
 * 
 * @param {string} mediaUrl	URL of the media to set in the container
 * @param {Array} containers	Array of containers to set the media
 * @param {Array} imgClassList	Array of classes to apply to the image
 * @param {Object} videoOptions	Options for the video element
 */
const loadMedia = (mediaUrl, containers, imgClassList = [], videoOptions = {}) => {

    containers.forEach(container => {

        container.innerHTML = '';
        container.classList.add('d-flex', 'justify-content-center', 'align-items-center');

        const spinner = document.createElement('div');
        spinner.classList.add('spinner-border', 'text-secondary');
        spinner.style.width = '2rem';
        spinner.style.height = '2rem';
        spinner.setAttribute('role', 'status');
        spinner.innerHTML = '<span class="visually-hidden">Loading...</span>';
        const spinnerSpan = document.createElement('span');
        spinnerSpan.classList.add('visually-hidden');
        spinnerSpan.innerText = 'Loading...';
        spinner.appendChild(spinnerSpan);
        container.appendChild(spinner);

        fetch(mediaUrl)
            .then(response => response.blob())
            .then(blob => {
                const mimeType = blob.type;
                container.innerHTML = '';
                container.classList.remove('d-flex', 'justify-content-center', 'align-items-center'); 

                if (mimeType.startsWith('image/')) {
                    const img = document.createElement('img');
                    img.src = mediaUrl;
                    img.alt = 'Media image';
                    imgClassList.forEach(className => img.classList.add(className));
                    container.appendChild(img);
                } else if (mimeType.startsWith('video/')) {
                    const video = document.createElement('video');
                    video.src = mediaUrl;
                    video.autoplay = videoOptions.autoplay || true;
                    video.loop = videoOptions.loop || false;
                    video.muted = videoOptions.muted || true;
                    video.controls = videoOptions.controls || false;
                    imgClassList.forEach(className => video.classList.add(className));
                    container.appendChild(video);
                } else {
                    console.error('Unknown media type:', mimeType);
                }
            })
            .catch(error => {
                console.error('Error fetching media:', error);
                container.innerHTML = '<p>Error loading media</p>';
            });
    });
};