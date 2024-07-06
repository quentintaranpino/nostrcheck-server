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
const showMessage = (message, messageClass = "alert-warning", timeout = 2500) => {
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

  setTimeout(() => {
      $('#' + messageBox).fadeOut(500, function () {
          $(this).remove();
      });
  }, timeout);
}

