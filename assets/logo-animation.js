(() => {
  'use strict';

  const ANIMATION_DURATION = 4200;

  function initLogoAnimation() {
    const scene = document.querySelector('#hero-logo-scene');
    const trigger = document.querySelector('#hero-logo-trigger');
    const target = scene?.querySelector('.goal-target');

    if (!scene || !trigger || !target) return;

    let resetTimer = null;
    let isAnimating = false;

    const setTrajectory = () => {
      const goal = scene.querySelector('.hero-goal');
      goal?.classList.add('is-measuring');

      const triggerRect = trigger.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      goal?.classList.remove('is-measuring');

      const triggerCenterX = triggerRect.left + triggerRect.width / 2;
      const triggerCenterY = triggerRect.top + triggerRect.height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      const dx = targetCenterX - triggerCenterX;
      const dy = targetCenterY - triggerCenterY;

      scene.style.setProperty('--goal-x-35', `${dx * 0.35}px`);
      scene.style.setProperty('--goal-y-35', `${dy * 0.35}px`);
      scene.style.setProperty('--goal-x-72', `${dx * 0.72}px`);
      scene.style.setProperty('--goal-y-72', `${dy * 0.72}px`);
      scene.style.setProperty('--goal-x-full', `${dx}px`);
      scene.style.setProperty('--goal-y-full', `${dy}px`);
    };

    const resetAnimation = () => {
      scene.classList.remove('is-logo-shooting');
      trigger.disabled = false;
      trigger.setAttribute('aria-label', 'Fai tirare il logo verso la porta');
      isAnimating = false;
    };

    const playAnimation = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (isAnimating) return;
      isAnimating = true;

      window.clearTimeout(resetTimer);
      scene.classList.remove('is-logo-shooting');
      setTrajectory();
      void scene.offsetWidth;
      scene.classList.add('is-logo-shooting');

      trigger.disabled = true;
      trigger.setAttribute('aria-label', 'Il logo sta tirando e segna un goal');

      resetTimer = window.setTimeout(resetAnimation, ANIMATION_DURATION);
    };

    if ('PointerEvent' in window) {
      trigger.addEventListener('pointerup', playAnimation, { passive: false });
    } else {
      trigger.addEventListener('click', playAnimation, { passive: false });
      trigger.addEventListener('touchend', playAnimation, { passive: false });
    }

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        playAnimation(event);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogoAnimation);
  } else {
    initLogoAnimation();
  }
})();
