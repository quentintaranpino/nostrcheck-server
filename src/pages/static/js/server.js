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
  localStorage.removeItem('authkey');
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
