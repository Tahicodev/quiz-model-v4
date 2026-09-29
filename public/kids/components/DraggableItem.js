/**
 * public/kids/components/DraggableItem.js
 *
 * Touch and mouse drag-and-drop utility designed for children's tablets and laptops.
 * Supports HTML5 Drag & Drop as well as pointer/touch events for iOS/Android tablets.
 */

export class DraggableItem {
  /**
   * Make an element draggable and connect drop zones.
   * @param {HTMLElement} element
   * @param {{
   *   data: any,
   *   onDragStart?: Function,
   *   onDragEnd?: Function,
   *   dropZonesSelector?: string,
   *   onDrop?: (targetZone: HTMLElement, data: any) => void
   * }} options
   */
  static attach(element, { data, onDragStart, onDragEnd, dropZonesSelector, onDrop }) {
    element.setAttribute('draggable', 'true');
    element.classList.add('kids-draggable');

    // Desktop HTML5 drag
    element.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify(data));
      element.classList.add('is-dragging');
      if (onDragStart) onDragStart(data);
    });

    element.addEventListener('dragend', () => {
      element.classList.remove('is-dragging');
      if (onDragEnd) onDragEnd();
    });

    // Touch support for tablets & iPads
    let activeClone = null;
    let touchStartX = 0;
    let touchStartY = 0;

    element.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      activeClone = element.cloneNode(true);
      activeClone.classList.add('kids-touch-clone');
      activeClone.style.position = 'fixed';
      activeClone.style.pointerEvents = 'none';
      activeClone.style.zIndex = '9999';
      activeClone.style.opacity = '0.85';
      activeClone.style.transform = 'scale(1.08)';
      activeClone.style.left = `${touch.clientX - element.offsetWidth / 2}px`;
      activeClone.style.top = `${touch.clientY - element.offsetHeight / 2}px`;
      document.body.appendChild(activeClone);

      element.classList.add('is-dragging');
      if (onDragStart) onDragStart(data);
    }, { passive: false });

    element.addEventListener('touchmove', (e) => {
      if (!activeClone) return;
      e.preventDefault();
      const touch = e.touches[0];
      activeClone.style.left = `${touch.clientX - element.offsetWidth / 2}px`;
      activeClone.style.top = `${touch.clientY - element.offsetHeight / 2}px`;

      // Highlight hover drop zone
      if (dropZonesSelector) {
        const dropZones = document.querySelectorAll(dropZonesSelector);
        dropZones.forEach(zone => {
          const rect = zone.getBoundingClientRect();
          if (
            touch.clientX >= rect.left &&
            touch.clientX <= rect.right &&
            touch.clientY >= rect.top &&
            touch.clientY <= rect.bottom
          ) {
            zone.classList.add('drop-hover');
          } else {
            zone.classList.remove('drop-hover');
          }
        });
      }
    }, { passive: false });

    element.addEventListener('touchend', (e) => {
      if (activeClone) {
        activeClone.remove();
        activeClone = null;
      }
      element.classList.remove('is-dragging');

      const touch = e.changedTouches[0];
      if (dropZonesSelector && onDrop) {
        const dropZones = document.querySelectorAll(dropZonesSelector);
        dropZones.forEach(zone => {
          zone.classList.remove('drop-hover');
          const rect = zone.getBoundingClientRect();
          if (
            touch.clientX >= rect.left &&
            touch.clientX <= rect.right &&
            touch.clientY >= rect.top &&
            touch.clientY <= rect.bottom
          ) {
            onDrop(zone, data);
          }
        });
      }
      if (onDragEnd) onDragEnd();
    });
  }

  /**
   * Setup a container as a drop zone for HTML5 drag events.
   */
  static setupDropZone(zoneElement, onDropCallback) {
    zoneElement.classList.add('kids-dropzone');

    zoneElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      zoneElement.classList.add('drop-hover');
    });

    zoneElement.addEventListener('dragleave', () => {
      zoneElement.classList.remove('drop-hover');
    });

    zoneElement.addEventListener('drop', (e) => {
      e.preventDefault();
      zoneElement.classList.remove('drop-hover');
      try {
        const raw = e.dataTransfer.getData('text/plain');
        const data = JSON.parse(raw);
        onDropCallback(zoneElement, data);
      } catch (err) {
        console.error('Error in drop handler:', err);
      }
    });
  }
}
