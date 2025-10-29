/**
 * [ADDED] ExpandableTextbox Component
 * A configurable, auto-expanding textbox with manual controls and smooth animations
 * Designed for browser extension integration with existing styling
 */
class ExpandableTextbox {
  constructor(options = {}) {
    // [ADDED] Configuration options with sensible defaults
    this.config = {
      // Height settings
      minHeight: 40,                    // Minimum height in pixels
      defaultHeight: 80,               // Default height in pixels
      maxHeightRatio: 0.6,            // Maximum height as ratio of viewport height
      
      // Animation settings
      animationDuration: 200,          // Animation duration in milliseconds
      resizeDebounceDelay: 16,         // Debounce delay for resize calculations (60fps)
      
      // Behavior settings
      autoExpand: true,                // Enable automatic expansion
      smoothResize: true,              // Enable smooth resize animations
      preserveFormatting: true,        // Preserve pasted code formatting
      
      // Accessibility
      enableKeyboardNav: true,         // Enable keyboard navigation
      announceChanges: true,           // Announce changes to screen readers
      
      // Integration
      preserveExistingStyles: true,    // Preserve existing CSS styles
      themeAware: true,                // Support theme overrides
      
      ...options
    };

    // [ADDED] State management
    this.state = {
      isExpanded: false,
      isResizing: false,
      currentHeight: this.config.defaultHeight,
      maxHeight: this.calculateMaxHeight(),
      isDragging: false,
      dragStartY: 0,
      dragStartHeight: 0
    };

    // [ADDED] DOM elements (will be set during initialization)
    this.container = null;
    this.textarea = null;
    this.toggleBtn = null;
    this.dragHandle = null;
    this.resizeObserver = null;
    
    // [ADDED] Event listeners storage for cleanup
    this.eventListeners = new Map();
    
    // [ADDED] Debounced resize function
    this.debouncedResize = this.debounce(this.handleAutoResize.bind(this), this.config.resizeDebounceDelay);
    
    // [ADDED] Initialize component
    this.init();
  }

  /**
   * [ADDED] Initialize the component
   */
  init() {
    this.setupContainer();
    this.setupTextarea();
    this.setupControls();
    this.setupEventListeners();
    this.setupAccessibility();
    this.updateStyles();
    
    // [ADDED] Initial height calculation
    this.updateHeight();
  }

  /**
   * [ADDED] Setup the main container structure
   */
  setupContainer() {
    // Create container wrapper
    this.container = document.createElement('div');
    this.container.className = 'expandable-textbox-container';
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', 'Expandable text input');
    
    // [ADDED] Add container styles
    this.container.style.cssText = `
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      background: var(--panel, #131a2a);
      border-radius: 8px;
      border: 1px solid var(--border, #253046);
      transition: all ${this.config.animationDuration}ms ease;
    `;
  }

  /**
   * [ADDED] Setup the textarea element
   */
  setupTextarea() {
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'expandable-textbox-input';
    this.textarea.setAttribute('rows', '2');
    this.textarea.setAttribute('placeholder', 'Ask anything about this problem…');
    this.textarea.setAttribute('required', '');
    this.textarea.setAttribute('aria-label', 'Message input');
    this.textarea.setAttribute('aria-describedby', 'textbox-controls');
    
    // [ADDED] Preserve existing textarea styles while adding new functionality
    this.textarea.style.cssText = `
      width: 100%;
      min-height: ${this.config.minHeight}px;
      max-height: ${this.state.maxHeight}px;
      border: none;
      border-radius: 8px;
      background: #0e1526;
      color: var(--text, #e5e7eb);
      padding: 10px 12px;
      font: inherit;
      line-height: 1.3;
      resize: none;
      overflow-y: auto;
      outline: none;
      transition: height ${this.config.animationDuration}ms ease;
      box-sizing: border-box;
    `;

    this.container.appendChild(this.textarea);
  }

  /**
   * [ADDED] Setup control elements (toggle button and drag handle)
   */
  setupControls() {
    // Create controls container
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'textbox-controls';
    controlsContainer.id = 'textbox-controls';
    controlsContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.1);
      border-top: 1px solid var(--border, #253046);
      border-radius: 0 0 8px 8px;
    `;

    // [ADDED] Toggle button for expand/collapse
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'textbox-toggle-btn';
    this.toggleBtn.setAttribute('type', 'button');
    this.toggleBtn.setAttribute('aria-label', 'Toggle textbox size');
    this.toggleBtn.setAttribute('aria-expanded', 'false');
    this.toggleBtn.innerHTML = '⤢'; // Expand icon
    this.toggleBtn.style.cssText = `
      background: transparent;
      border: 1px solid var(--border, #253046);
      color: var(--text, #e5e7eb);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 150ms ease;
    `;

    // [ADDED] Drag handle for manual resizing
    this.dragHandle = document.createElement('div');
    this.dragHandle.className = 'textbox-drag-handle';
    this.dragHandle.setAttribute('role', 'separator');
    this.dragHandle.setAttribute('aria-label', 'Resize textbox');
    this.dragHandle.setAttribute('aria-orientation', 'vertical');
    this.dragHandle.innerHTML = '⋮⋮'; // Drag handle icon
    this.dragHandle.style.cssText = `
      width: 20px;
      height: 20px;
      background: transparent;
      border: 1px solid var(--border, #253046);
      color: var(--text, #e5e7eb);
      border-radius: 4px;
      cursor: ns-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      line-height: 1;
      transition: all 150ms ease;
      user-select: none;
    `;

    // [ADDED] Add hover effects
    this.addHoverEffects();

    controlsContainer.appendChild(this.toggleBtn);
    controlsContainer.appendChild(this.dragHandle);
    this.container.appendChild(controlsContainer);
  }

  /**
   * [ADDED] Add hover effects for interactive elements
   */
  addHoverEffects() {
    const hoverStyle = `
      border-color: var(--accent, #ffb43a) !important;
      background: rgba(255, 180, 58, 0.1) !important;
    `;

    this.toggleBtn.addEventListener('mouseenter', () => {
      this.toggleBtn.style.cssText += hoverStyle;
    });

    this.toggleBtn.addEventListener('mouseleave', () => {
      this.toggleBtn.style.cssText = this.toggleBtn.style.cssText.replace(hoverStyle, '');
    });

    this.dragHandle.addEventListener('mouseenter', () => {
      this.dragHandle.style.cssText += hoverStyle;
    });

    this.dragHandle.addEventListener('mouseleave', () => {
      this.dragHandle.style.cssText = this.dragHandle.style.cssText.replace(hoverStyle, '');
    });
  }

  /**
   * [ADDED] Setup event listeners
   */
  setupEventListeners() {
    // [ADDED] Auto-resize on input
    this.addEventListener(this.textarea, 'input', () => {
      if (this.config.autoExpand) {
        this.debouncedResize();
      }
    });

    // [ADDED] Handle paste events to preserve formatting
    this.addEventListener(this.textarea, 'paste', (e) => {
      if (this.config.preserveFormatting) {
        // Let the default paste behavior occur, then resize
        setTimeout(() => {
          this.debouncedResize();
        }, 0);
      }
    });

    // [ADDED] Toggle button functionality
    this.addEventListener(this.toggleBtn, 'click', () => {
      this.toggleExpansion();
    });

    // [ADDED] Drag handle functionality
    this.addEventListener(this.dragHandle, 'mousedown', (e) => {
      this.startDrag(e);
    });

    // [ADDED] Handle window resize to recalculate max height
    this.addEventListener(window, 'resize', () => {
      this.state.maxHeight = this.calculateMaxHeight();
      this.updateHeight();
    });

    // [ADDED] Handle mouse up globally for drag functionality
    this.addEventListener(document, 'mouseup', () => {
      this.endDrag();
    });

    this.addEventListener(document, 'mousemove', (e) => {
      this.handleDrag(e);
    });

    // [ADDED] Keyboard navigation
    if (this.config.enableKeyboardNav) {
      this.setupKeyboardNavigation();
    }
  }

  /**
   * [ADDED] Setup keyboard navigation
   */
  setupKeyboardNavigation() {
    this.addEventListener(this.textarea, 'keydown', (e) => {
      // Ctrl/Cmd + Enter to toggle expansion
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.toggleExpansion();
      }
      
      // Escape to collapse if expanded
      if (e.key === 'Escape' && this.state.isExpanded) {
        this.collapse();
      }
    });

    // [ADDED] Focus management for controls
    this.addEventListener(this.toggleBtn, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleExpansion();
      }
    });
  }

  /**
   * [ADDED] Setup accessibility features
   */
  setupAccessibility() {
    if (this.config.announceChanges) {
      // Create live region for announcements
      const liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      liveRegion.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      this.container.appendChild(liveRegion);
      this.liveRegion = liveRegion;
    }
  }

  /**
   * [ADDED] Handle automatic resizing based on content
   */
  handleAutoResize() {
    if (this.state.isResizing || !this.config.autoExpand) return;

    const scrollHeight = this.textarea.scrollHeight;
    const newHeight = Math.max(
      this.config.minHeight,
      Math.min(scrollHeight, this.state.maxHeight)
    );

    if (newHeight !== this.state.currentHeight) {
      this.state.currentHeight = newHeight;
      this.updateHeight();
      this.announceChange(`Textbox resized to ${Math.round(newHeight)} pixels`);
    }
  }

  /**
   * [ADDED] Update the height of the textarea
   */
  updateHeight() {
    if (this.config.smoothResize) {
      this.textarea.style.height = `${this.state.currentHeight}px`;
    } else {
      this.textarea.style.height = `${this.state.currentHeight}px`;
    }

    // [ADDED] Update scrollbar visibility
    if (this.state.currentHeight >= this.state.maxHeight) {
      this.textarea.style.overflowY = 'auto';
    } else {
      this.textarea.style.overflowY = 'hidden';
    }
  }

  /**
   * [ADDED] Toggle expansion state
   */
  toggleExpansion() {
    if (this.state.isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  /**
   * [ADDED] Expand the textbox
   */
  expand() {
    this.state.isExpanded = true;
    this.state.currentHeight = this.state.maxHeight;
    this.updateHeight();
    this.updateToggleButton();
    this.announceChange('Textbox expanded');
  }

  /**
   * [ADDED] Collapse the textbox
   */
  collapse() {
    this.state.isExpanded = false;
    this.state.currentHeight = this.config.defaultHeight;
    this.updateHeight();
    this.updateToggleButton();
    this.announceChange('Textbox collapsed');
  }

  /**
   * [ADDED] Update toggle button appearance
   */
  updateToggleButton() {
    this.toggleBtn.innerHTML = this.state.isExpanded ? '⤋' : '⤢';
    this.toggleBtn.setAttribute('aria-expanded', this.state.isExpanded.toString());
  }

  /**
   * [ADDED] Start drag operation
   */
  startDrag(e) {
    e.preventDefault();
    this.state.isDragging = true;
    this.state.dragStartY = e.clientY;
    this.state.dragStartHeight = this.state.currentHeight;
    this.dragHandle.style.cursor = 'ns-resize';
    this.container.style.userSelect = 'none';
  }

  /**
   * [ADDED] Handle drag operation
   */
  handleDrag(e) {
    if (!this.state.isDragging) return;

    const deltaY = e.clientY - this.state.dragStartY;
    const newHeight = Math.max(
      this.config.minHeight,
      Math.min(
        this.state.dragStartHeight + deltaY,
        this.state.maxHeight
      )
    );

    this.state.currentHeight = newHeight;
    this.updateHeight();
  }

  /**
   * [ADDED] End drag operation
   */
  endDrag() {
    if (!this.state.isDragging) return;

    this.state.isDragging = false;
    this.dragHandle.style.cursor = 'ns-resize';
    this.container.style.userSelect = '';
    this.announceChange(`Textbox resized to ${Math.round(this.state.currentHeight)} pixels`);
  }

  /**
   * [ADDED] Calculate maximum height based on viewport
   */
  calculateMaxHeight() {
    const viewportHeight = window.innerHeight;
    return Math.max(
      this.config.minHeight * 2,
      Math.floor(viewportHeight * this.config.maxHeightRatio)
    );
  }

  /**
   * [ADDED] Update styles based on current state
   */
  updateStyles() {
    if (this.config.themeAware) {
      // [ADDED] Support for theme overrides
      const rootStyles = getComputedStyle(document.documentElement);
      const bgColor = rootStyles.getPropertyValue('--panel') || '#131a2a';
      const borderColor = rootStyles.getPropertyValue('--border') || '#253046';
      const textColor = rootStyles.getPropertyValue('--text') || '#e5e7eb';
      const accentColor = rootStyles.getPropertyValue('--accent') || '#ffb43a';

      this.container.style.setProperty('--panel', bgColor);
      this.container.style.setProperty('--border', borderColor);
      this.container.style.setProperty('--text', textColor);
      this.container.style.setProperty('--accent', accentColor);
    }
  }

  /**
   * [ADDED] Announce changes to screen readers
   */
  announceChange(message) {
    if (this.config.announceChanges && this.liveRegion) {
      this.liveRegion.textContent = message;
    }
  }

  /**
   * [ADDED] Debounce function for performance
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * [ADDED] Add event listener with cleanup tracking
   */
  addEventListener(element, event, handler) {
    element.addEventListener(event, handler);
    
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, new Map());
    }
    this.eventListeners.get(element).set(event, handler);
  }

  /**
   * [ADDED] Public API methods
   */

  /**
   * Get the textarea element
   */
  getTextarea() {
    return this.textarea;
  }

  /**
   * Get the container element
   */
  getContainer() {
    return this.container;
  }

  /**
   * Set the text content
   */
  setValue(value) {
    this.textarea.value = value;
    this.debouncedResize();
  }

  /**
   * Get the text content
   */
  getValue() {
    return this.textarea.value;
  }

  /**
   * Focus the textarea
   */
  focus() {
    this.textarea.focus();
  }

  /**
   * Set configuration options
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.state.maxHeight = this.calculateMaxHeight();
    this.updateStyles();
    this.updateHeight();
  }

  /**
   * [ADDED] Destroy the component and clean up
   */
  destroy() {
    // Remove event listeners
    this.eventListeners.forEach((events, element) => {
      events.forEach((handler, event) => {
        element.removeEventListener(event, handler);
      });
    });
    this.eventListeners.clear();

    // Remove from DOM
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Clear references
    this.container = null;
    this.textarea = null;
    this.toggleBtn = null;
    this.dragHandle = null;
    this.liveRegion = null;
  }
}

// [ADDED] Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExpandableTextbox;
} else if (typeof window !== 'undefined') {
  window.ExpandableTextbox = ExpandableTextbox;
}
