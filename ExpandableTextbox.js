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

    // [MODIFIED] DOM elements (will be set during initialization)
    this.container = null;
    this.textarea = null;
    // [REMOVED] Manual control elements
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
   * [REMOVED] Manual controls setup - no longer needed
   */
  setupControls() {
    // [REMOVED] Toggle button and drag handle removed as per user request
    // Component now relies solely on automatic expansion
  }

  /**
   * [REMOVED] Hover effects for manual controls - no longer needed
   */
  addHoverEffects() {
    // [REMOVED] Manual control hover effects removed as controls are no longer present
  }

  /**
   * [MODIFIED] Setup event listeners - removed manual control listeners
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

    // [REMOVED] Toggle button and drag handle event listeners

    // [FIXED] Handle window resize to recalculate max height
    this.addEventListener(window, 'resize', () => {
      this.state.maxHeight = this.calculateMaxHeight();
      // [FIXED] Re-trigger auto-resize to ensure proper behavior after resize
      this.debouncedResize();
    });

    // [REMOVED] Drag functionality event listeners

    // [ADDED] Keyboard navigation
    if (this.config.enableKeyboardNav) {
      this.setupKeyboardNavigation();
    }
  }

  /**
   * [MODIFIED] Setup keyboard navigation - removed manual control shortcuts
   */
  setupKeyboardNavigation() {
    this.addEventListener(this.textarea, 'keydown', (e) => {
      // [REMOVED] Manual control keyboard shortcuts
      // Textbox now expands automatically based on content
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
   * [FIXED] Handle automatic resizing based on content - ensures proper 50-66% screen limit
   */
  handleAutoResize() {
    if (this.state.isResizing || !this.config.autoExpand) return;

    // [FIXED] Temporarily reset height to get accurate scrollHeight
    this.textarea.style.height = 'auto';
    this.textarea.style.overflowY = 'hidden';
    
    const scrollHeight = this.textarea.scrollHeight;
    const maxHeight = this.state.maxHeight;
    
    let newHeight;
    let shouldShowScrollbar = false;
    
    if (scrollHeight <= maxHeight) {
      // Content fits within max height - expand to fit content
      newHeight = Math.max(this.config.minHeight, scrollHeight);
      shouldShowScrollbar = false;
    } else {
      // Content exceeds max height - STOP expanding and show scrollbar
      newHeight = maxHeight;
      shouldShowScrollbar = true;
    }

    // [FIXED] Update state and height
    this.state.currentHeight = newHeight;
    
    // [FIXED] Apply height first, then scrollbar settings
    this.textarea.style.height = `${newHeight}px`;
    
    // [FIXED] Force a reflow to ensure height is applied
    this.textarea.offsetHeight;
    
    // [FIXED] Now set overflow based on whether content still exceeds height
    if (shouldShowScrollbar) {
      this.textarea.style.overflowY = 'auto';
      // [FIXED] Double-check that scrollbar is needed after height is set
      if (this.textarea.scrollHeight <= this.textarea.clientHeight) {
        this.textarea.style.overflowY = 'hidden';
        shouldShowScrollbar = false;
      }
    } else {
      this.textarea.style.overflowY = 'hidden';
    }
    
    // [ADDED] Debug logging to verify behavior
    console.log(`[ExpandableTextbox] Height: ${Math.round(newHeight)}px, Max: ${Math.round(maxHeight)}px, Scrollable: ${shouldShowScrollbar}, Content: ${scrollHeight}px, ClientHeight: ${this.textarea.clientHeight}px`);
    
    this.announceChange(`Textbox resized to ${Math.round(newHeight)} pixels${shouldShowScrollbar ? ' (scrollable)' : ''}`);
  }

  /**
   * [SIMPLIFIED] Update the height of the textarea - scrollbar logic handled in handleAutoResize
   */
  updateHeight() {
    // [SIMPLIFIED] Just set the height, scrollbar logic is handled in handleAutoResize
    this.textarea.style.height = `${this.state.currentHeight}px`;
  }

  /**
   * [REMOVED] Manual control methods - no longer needed
   * All expansion is now automatic based on content
   */

  /**
   * [FIXED] Calculate maximum height based on viewport - ensure 50-66% of screen
   */
  calculateMaxHeight() {
    const viewportHeight = window.innerHeight;
    // [FIXED] Ensure we use 50-66% of viewport height as requested
    const calculatedMaxHeight = Math.floor(viewportHeight * this.config.maxHeightRatio);
    
    // [FIXED] Ensure minimum reasonable height but respect the ratio
    const minReasonableHeight = Math.max(this.config.minHeight * 3, 200); // At least 3x min height or 200px
    
    return Math.max(minReasonableHeight, calculatedMaxHeight);
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
    // [REMOVED] Manual control references
    this.liveRegion = null;
  }
}

// [ADDED] Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExpandableTextbox;
} else if (typeof window !== 'undefined') {
  window.ExpandableTextbox = ExpandableTextbox;
}
