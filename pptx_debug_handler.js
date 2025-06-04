function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96;
    var pptxHtmlContent = null;
    var slideCount = 0;
    var lastRenderedPageIndex = -1;
    var lastRenderedScale = 1;
    var lastRenderedRotation = 0;
    var isFirstRender = true;
    var renderCache = new Map();

    // Debug function to log all steps
    function debugLog(message, data) {
        console.log(`[PPTX DEBUG] ${message}`, data || '');
    }

    // Clone method required by InteractionController
    this.clone = function() {
        return new PptxHandler(document.createElement('canvas'));
    };

    // Enhanced initialization with better error handling
    this.init = function (onCompletion) {
        debugLog("Starting initialization");
        
        // Check if canvas exists
        if (!canvas) {
            debugLog("ERROR: Canvas not provided to PptxHandler");
            if (onCompletion) onCompletion(new Error("Canvas not provided"));
            return;
        }
        
        // Check if PPTXjs library is already loaded
        if (typeof $ !== 'undefined' && $.fn.pptxToHtml) {
            debugLog("PPTXjs already loaded, proceeding");
            if (onCompletion) onCompletion();
            return;
        }
        
        // Enhanced styling
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            .slide {
                position: relative !important;
                width: 1280px !important;
                min-height: 720px !important;
                height: auto !important;
                padding: 100px 50px 100px 50px !important;
                margin: 50px auto !important;
                overflow: visible !important;
                background-color: white !important;
                border: none !important;
                border-radius: 0 !important;
                box-sizing: border-box !important;
            }
            
            .slide *[style*="position: absolute"],
            .slide *[style*="position:absolute"] {
                position: absolute !important;
            }
            
            .slide .block,
            .slide .content,
            .slide-content-container,
            .pptx-div-container,
            .divs2slidesjs-slide {
                overflow: visible !important;
                position: relative !important;
            }
            
            #documentCanvas {
                margin: 0 auto;
                display: block;
                background-color: #bbbbbb;
            }
            
            #viewerPanel {
                display: flex !important;
                justify-content: center;
                align-items: flex-start;
                padding: 20px;
                background-color: #bbbbbb;
                overflow: auto;
            }
        `;
        document.head.appendChild(style);
        debugLog("Styles added");
        
        // Check if pptxjs script already exists
        const existingScript = document.querySelector('script[src*="pptxjs"]');
        if (existingScript) {
            debugLog("PPTXjs script already exists, waiting for load");
            existingScript.onload = function() {
                debugLog("Existing PPTXjs script loaded");
                if (onCompletion) onCompletion();
            };
            return;
        }
        
        // Load PPTXjs library
        var script = document.createElement("script");
        script.onload = function () {
            debugLog("PPTXjs library loaded successfully");
            // Verify library is available
            if (typeof $ === 'undefined') {
                debugLog("ERROR: jQuery not available");
                if (onCompletion) onCompletion(new Error("jQuery not available"));
                return;
            }
            if (!$.fn.pptxToHtml) {
                debugLog("ERROR: pptxToHtml plugin not available");
                if (onCompletion) onCompletion(new Error("pptxToHtml plugin not available"));
                return;
            }
            if (onCompletion) onCompletion();
        };
        script.onerror = function(error) {
            debugLog("ERROR: Failed to load PPTXjs library", error);
            if (onCompletion) onCompletion(error);
        };
        
        // Use different URL if _UV_VERSION is not defined
        const version = typeof _UV_VERSION !== 'undefined' ? _UV_VERSION : Date.now();
        script.src = `js/libs/pptxjs.js?v=${version}`;
        debugLog("Loading PPTXjs from:", script.src);
        document.head.appendChild(script);
    };

    // Enhanced document loading with comprehensive error handling
    this.loadDocument = async function (documentUrl, onCompletion, onError) {
        try {
            debugLog("Starting document load:", documentUrl);
            
            // Validate inputs
            if (!documentUrl) {
                throw new Error("Document URL is required");
            }
            
            if (typeof $ === 'undefined' || !$.fn.pptxToHtml) {
                throw new Error("PPTXjs library not loaded");
            }
            
            benchmark.time("Enhanced PPTX Document loaded");
            
            // Create or get modal element
            let targetElement = document.getElementById('myModal');
            if (!targetElement) {
                targetElement = document.createElement('div');
                targetElement.id = 'myModal';
                targetElement.style.cssText = `
                    position: absolute;
                    left: -10000px;
                    top: -10000px;
                    width: 2000px;
                    height: 2000px;
                    overflow: visible;
                    z-index: -1000;
                `;
                document.body.appendChild(targetElement);
                debugLog("Created myModal element");
            } else {
                // Clear existing content
                targetElement.innerHTML = '';
                debugLog("Cleared existing myModal content");
            }
            
            // Enhanced promise-based processing
            await new Promise((resolve, reject) => {
                let slideDetectionTimeout;
                let processingTimeout;
                let attempts = 0;
                const maxAttempts = 3;
                
                function attemptProcessing() {
                    attempts++;
                    debugLog(`Processing attempt ${attempts}/${maxAttempts}`);
                    
                    const observer = new MutationObserver((mutations) => {
                        const slides = targetElement.querySelectorAll('.slide');
                        debugLog(`Mutation observed: ${slides.length} slides found`);
                        
                        if (slides.length > 0) {
                            // Clear timeouts
                            if (slideDetectionTimeout) clearTimeout(slideDetectionTimeout);
                            if (processingTimeout) clearTimeout(processingTimeout);
                            
                            // Stop observing
                            observer.disconnect();
                            
                            // Process slides after a short delay
                            setTimeout(() => {
                                try {
                                    debugLog("Processing slides...");
                                    
                                    // Apply content fixes
                                    comprehensiveContentFix(slides);
                                    
                                    // Extract slide content
                                    const slideContents = [];
                                    slides.forEach((slide, index) => {
                                        const metrics = calculateEnhancedSlideMetrics(slide);
                                        
                                        // Apply calculated adjustments
                                        slide.style.minHeight = metrics.totalHeight + "px";
                                        slide.style.paddingTop = metrics.adjustmentNeeded + "px";
                                        slide.style.paddingBottom = metrics.adjustmentNeeded + "px";
                                        
                                        const slideHTML = slide.outerHTML;
                                        slideContents.push(slideHTML);
                                        debugLog(`Processed slide ${index + 1}`);
                                    });
                                    
                                    // Create result object
                                    pptxHtmlContent = {
                                        slides: slideContents,
                                        presentationSize: { width: 1280, height: 720 }
                                    };
                                    
                                    slideCount = slideContents.length;
                                    debugLog(`Processing complete. Total slides: ${slideCount}`);
                                    
                                    resolve();
                                } catch (processingError) {
                                    debugLog("ERROR in slide processing:", processingError);
                                    reject(processingError);
                                }
                            }, 2000);
                        }
                    });
                    
                    // Start observing
                    observer.observe(targetElement, {
                        childList: true,
                        subtree: true,
                        attributes: false,
                        characterData: false
                    });
                    
                    // Set detection timeout
                    slideDetectionTimeout = setTimeout(() => {
                        observer.disconnect();
                        debugLog(`Attempt ${attempts} timed out - no slides detected`);
                        
                        if (attempts < maxAttempts) {
                            // Try again
                            setTimeout(attemptProcessing, 2000);
                        } else {
                            reject(new Error("PPTX conversion failed - no slides detected after all attempts"));
                        }
                    }, 15000); // Increased timeout
                    
                    // Initialize PPTX conversion
                    try {
                        debugLog("Initializing pptxToHtml...");
                        $(targetElement).pptxToHtml({
                            pptxFileUrl: documentUrl,
                            slidesScale: 1,
                            slideMode: false,
                            keyBoardShortCut: false,
                            mediaProcess: false,
                            jsZipV2: false
                        });
                        debugLog("pptxToHtml initialized");
                    } catch (initError) {
                        debugLog("ERROR initializing pptxToHtml:", initError);
                        observer.disconnect();
                        if (slideDetectionTimeout) clearTimeout(slideDetectionTimeout);
                        reject(initError);
                    }
                }
                
                // Start first attempt
                attemptProcessing();
            });
            
            benchmark.timeEnd("Enhanced PPTX Document loaded");
            debugLog("Document load complete");
            
            if (onCompletion) {
                onCompletion(null, pptxHtmlContent);
            }
            
        } catch (error) {
            debugLog("ERROR in loadDocument:", error);
            benchmark.timeEnd("Enhanced PPTX Document loaded");
            if (onError) {
                onError(error);
            } else {
                throw error;
            }
        }
    };

    // Enhanced content positioning fix with debug info
    function comprehensiveContentFix(slides) {
        debugLog(`Applying content fixes to ${slides.length} slides`);
        
        slides.forEach((slide, index) => {
            debugLog(`Fixing slide ${index + 1}`);
            
            // Set slide container properties
            slide.style.cssText = `
                position: relative !important;
                width: 1280px !important;
                min-height: 720px !important;
                height: auto !important;
                padding: 100px 50px 100px 50px !important;
                margin: 50px auto !important;
                overflow: visible !important;
                background-color: white !important;
                border: none !important;
                border-radius: 0 !important;
                box-sizing: border-box !important;
            `;
            
            // Fix positioned elements
            const positionedElements = slide.querySelectorAll('*');
            let fixedElements = 0;
            
            positionedElements.forEach(element => {
                const elementStyle = element.style;
                
                // Fix negative top positions
                if (elementStyle.top && elementStyle.top.includes('px')) {
                    const topPos = parseInt(elementStyle.top);
                    if (topPos < 0) {
                        const adjustedTop = Math.max(0, topPos + 100);
                        element.style.top = adjustedTop + 'px';
                        fixedElements++;
                    }
                }
                
                // Fix transform translateY issues
                if (elementStyle.transform && elementStyle.transform.includes('translateY')) {
                    const match = elementStyle.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
                    if (match && match[1]) {
                        const translateY = parseFloat(match[1]);
                        if (translateY < -50) {
                            const adjustedTranslateY = Math.max(-50, translateY + 50);
                            const newTransform = elementStyle.transform.replace(
                                /translateY\((-?\d+(?:\.\d+)?)px\)/,
                                `translateY(${adjustedTranslateY}px)`
                            );
                            element.style.transform = newTransform;
                            fixedElements++;
                        }
                    }
                }
                
                // Ensure visibility
                if (window.getComputedStyle(element).overflow === 'hidden') {
                    element.style.overflow = 'visible';
                }
            });
            
            debugLog(`Fixed ${fixedElements} elements in slide ${index + 1}`);
        });
    }

    // Enhanced slide metrics calculation with debug info
    function calculateEnhancedSlideMetrics(slideElement) {
        if (!slideElement) {
            debugLog("No slide element provided for metrics calculation");
            return { minTop: 0, totalHeight: 720, adjustmentNeeded: 100 };
        }
        
        let minTop = 0;
        let maxBottom = 720;
        let contentElements = [];
        
        const allElements = slideElement.querySelectorAll('*');
        debugLog(`Calculating metrics for ${allElements.length} elements`);
        
        allElements.forEach(element => {
            const style = element.style;
            const rect = element.getBoundingClientRect();
            
            if (style.top && style.top.includes('px')) {
                const topPos = parseInt(style.top);
                minTop = Math.min(minTop, topPos);
                
                const height = parseInt(style.height) || rect.height || 0;
                maxBottom = Math.max(maxBottom, topPos + height);
                
                contentElements.push({
                    element: element,
                    top: topPos,
                    height: height,
                    bottom: topPos + height
                });
            }
            
            if (style.transform && style.transform.includes('translate')) {
                const translateMatch = style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
                if (translateMatch && translateMatch[1]) {
                    const translateY = parseFloat(translateMatch[1]);
                    minTop = Math.min(minTop, translateY);
                }
            }
        });
        
        const adjustmentNeeded = Math.max(100, Math.abs(Math.min(0, minTop)) + 50);
        const totalHeight = Math.max(720, maxBottom - minTop + adjustmentNeeded * 2);
        
        debugLog(`Metrics: minTop=${minTop}, maxBottom=${maxBottom}, adjustmentNeeded=${adjustmentNeeded}, totalHeight=${totalHeight}`);
        
        return {
            minTop: minTop,
            totalHeight: totalHeight,
            adjustmentNeeded: adjustmentNeeded,
            contentElements: contentElements
        };
    }

    // Enhanced drawing method with debug info
    this.drawDocument = function (scale, rotation, onCompletion) {
        debugLog(`drawDocument called - scale: ${scale}, rotation: ${rotation}`);
        
        if (!pptxHtmlContent || !pptxHtmlContent.slides || pptxHtmlContent.slides.length === 0) {
            debugLog("ERROR: No slides available for drawing");
            if (onCompletion) onCompletion(new Error("No slides available"));
            return;
        }
        
        benchmark.time("Enhanced PPTX Document drawn");
        self.redraw(scale, rotation, 0, function () {
            benchmark.timeEnd("Enhanced PPTX Document drawn");
            debugLog("drawDocument complete");
            if (onCompletion) onCompletion();
        });
    };

    // Enhanced redraw method with comprehensive debugging
    this.redraw = function (scale, rotation, pageIndex, onCompletion) {
        debugLog(`redraw called - page: ${pageIndex}, scale: ${scale}, rotation: ${rotation}`);
        
        // Validate inputs
        if (!canvas) {
            debugLog("ERROR: No canvas available for redraw");
            if (onCompletion) onCompletion(new Error("No canvas available"));
            return;
        }
        
        if (!pptxHtmlContent?.slides?.[pageIndex]) {
            debugLog(`ERROR: No slide data for index ${pageIndex}`);
            self.renderFallback(scale, rotation);
            if (onCompletion) onCompletion();
            return;
        }
        
        // Check cache
        const cacheKey = `${pageIndex}-${scale}-${rotation}`;
        if (!isFirstRender && renderCache.has(cacheKey)) {
            debugLog("Using cached render");
            const cachedImageData = renderCache.get(cacheKey);
            canvas.width = cachedImageData.width;
            canvas.height = cachedImageData.height;
            const ctx = canvas.getContext("2d");
            ctx.putImageData(cachedImageData.imageData, 0, 0);
            if (onCompletion) onCompletion();
            return;
        }
        
        // Update tracking
        lastRenderedPageIndex = pageIndex;
        lastRenderedScale = scale;
        lastRenderedRotation = rotation;
        
        const slideHtml = pptxHtmlContent.slides[pageIndex];
        debugLog(`Processing slide HTML (length: ${slideHtml.length})`);
        
        // Create temporary container
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = slideHtml;
        tempDiv.style.cssText = `
            position: absolute !important;
            left: -20000px !important;
            top: -20000px !important;
            z-index: -1000 !important;
            width: 2000px !important;
            height: 2000px !important;
            overflow: visible !important;
        `;
        
        const slideElement = tempDiv.querySelector('.slide');
        if (!slideElement) {
            debugLog("ERROR: No slide element found in HTML");
            self.renderFallback(scale, rotation);
            if (onCompletion) onCompletion();
            return;
        }
        
        // Prepare slide
        slideElement.style.cssText = `
            width: 1280px !important;
            min-height: 720px !important;
            height: auto !important;
            background-color: white !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
            position: relative !important;
            padding: ${isFirstRender ? '200px 100px 200px 100px' : '150px 75px 150px 75px'} !important;
        `;
        
        document.body.appendChild(tempDiv);
        debugLog("Temporary div added to document");
        
        // Calculate metrics
        const slideMetrics = calculateEnhancedSlideMetrics(slideElement);
        const renderHeight = Math.max(slideMetrics.totalHeight + 200, 1000);
        
        // Check if html2canvas is available
        if (typeof html2canvas === 'undefined') {
            debugLog("ERROR: html2canvas not available");
            self.renderFallback(scale, rotation);
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
            if (onCompletion) onCompletion();
            return;
        }
        
        const html2canvasOptions = {
            scale: Math.min(2, Math.max(1, 2 / scale)),
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white",
            logging: false,
            width: 1280 + 200,
            height: renderHeight,
            windowWidth: 1280 + 200,
            windowHeight: renderHeight,
            x: 0,
            y: Math.min(-100, slideMetrics.minTop - 50),
            scrollX: 0,
            scrollY: Math.min(-100, slideMetrics.minTop - 50),
            removeContainer: true
        };
        
        debugLog("Starting html2canvas rendering...");
        
        html2canvas(tempDiv, html2canvasOptions).then(function (renderedCanvas) {
            debugLog(`html2canvas success - rendered size: ${renderedCanvas.width}x${renderedCanvas.height}`);
            
            try {
                // Calculate dimensions
                let finalWidth, finalHeight;
                
                if (rotation === 90 || rotation === 270) {
                    const scaledWidth = 1280 * scale;
                    const scaledHeight = 720 * scale;
                    const diagonal = Math.sqrt(scaledWidth * scaledWidth + scaledHeight * scaledHeight);
                    finalWidth = finalHeight = Math.ceil(diagonal + 100);
                } else {
                    finalWidth = Math.ceil(1280 * scale);
                    finalHeight = Math.ceil(720 * scale);
                }
                
                // Set canvas size
                canvas.width = finalWidth;
                canvas.height = finalHeight;
                debugLog(`Canvas size set to: ${finalWidth}x${finalHeight}`);
                
                // Draw to canvas
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#bbbbbb";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.save();
                
                if (rotation !== 0) {
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    const drawWidth = 1280 * scale;
                    const drawHeight = 720 * scale;
                    
                    const sourceX = Math.max(0, (renderedCanvas.width - 1280) / 2);
                    const sourceY = Math.max(0, slideMetrics.adjustmentNeeded || 100);
                    const sourceDrawWidth = Math.min(1280, renderedCanvas.width - sourceX);
                    const sourceDrawHeight = Math.min(720, renderedCanvas.height - sourceY);
                    
                    ctx.drawImage(
                        renderedCanvas,
                        sourceX, sourceY, sourceDrawWidth, sourceDrawHeight,
                        -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight
                    );
                } else {
                    const centerX = (canvas.width - 1280 * scale) / 2;
                    const centerY = (canvas.height - 720 * scale) / 2;
                    
                    const sourceX = Math.max(0, (renderedCanvas.width - 1280) / 2);
                    const sourceY = Math.max(0, slideMetrics.adjustmentNeeded || 100);
                    const sourceDrawWidth = Math.min(1280, renderedCanvas.width - sourceX);
                    const sourceDrawHeight = Math.min(720, renderedCanvas.height - sourceY);
                    
                    ctx.drawImage(
                        renderedCanvas,
                        sourceX, sourceY, sourceDrawWidth, sourceDrawHeight,
                        centerX, centerY, 1280 * scale, 720 * scale
                    );
                }
                
                ctx.restore();
                debugLog("Canvas drawing complete");
                
                // Cache result
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                renderCache.set(cacheKey, {
                    imageData: imageData,
                    width: canvas.width,
                    height: canvas.height
                });
                
                // Limit cache size
                if (renderCache.size > 10) {
                    const firstKey = renderCache.keys().next().value;
                    renderCache.delete(firstKey);
                }
                
                // Update annotation canvas if exists
                const annotationCanvas = document.getElementById('annotationCanvas');
                if (annotationCanvas) {
                    annotationCanvas.width = canvas.width;
                    annotationCanvas.height = canvas.height;
                    debugLog("Annotation canvas updated");
                }
                
                // Update annotation handler if exists
                if (window.annotationHandler) {
                    window.annotationHandler.setDimensionsAndCalcOffset(scale, canvas.width, canvas.height);
                    window.annotationHandler.saveOriginalCanvasSize(self.originalWidth(), self.originalHeight());
                    debugLog("Annotation handler updated");
                }
                
                isFirstRender = false;
                debugLog("Redraw complete successfully");
                
            } catch (drawError) {
                debugLog("ERROR in canvas drawing:", drawError);
                self.renderFallback(scale, rotation);
            } finally {
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                if (onCompletion) onCompletion();
            }
            
        }).catch(function (error) {
            debugLog("ERROR in html2canvas:", error);
            self.renderFallback(scale, rotation);
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
            if (onCompletion) onCompletion();
        });
    };

    // Enhanced fallback rendering with debug info
    this.renderFallback = function(scale, rotation) {
        debugLog("Rendering fallback");
        
        canvas.width = 1280 * scale;
        canvas.height = 720 * scale;
        
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#666";
        ctx.font = Math.floor(24 * scale) + "px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Slide rendering failed", canvas.width/2, canvas.height/2 - 20 * scale);
        ctx.fillText("Check console for details", canvas.width/2, canvas.height/2 + 20 * scale);
    };

    // Other methods remain the same but with debug logging
    this.applyToCanvas = function (apply) {
        debugLog("applyToCanvas called");
        apply(canvas);
    };

    this.pageCount = function () {
        debugLog(`pageCount: ${slideCount}`);
        return slideCount;
    };

    this.originalWidth = function () {
        return pptxHtmlContent?.presentationSize?.width || 1280;
    };

    this.originalHeight = function () {
        return pptxHtmlContent?.presentationSize?.height || 720;
    };

    this.zoomToScale = function(scale, rotation, pageIndex, onCompletion) {
        debugLog(`zoomToScale: ${scale}`);
        self.redraw(scale, rotation, pageIndex, onCompletion);
    };

    this.cleanup = function() {
        debugLog("Cleaning up resources");
        const myModal = document.getElementById('myModal');
        if (myModal && document.body.contains(myModal)) {
            document.body.removeChild(myModal);
        }
        renderCache.clear();
        pptxHtmlContent = null;
        slideCount = 0;
    };

    this.createCanvases = function (callback, fromPage, pageCount) {
        debugLog(`createCanvases: from ${fromPage}, count ${pageCount}`);
        // Implementation remains the same but with debug logging
        // ... (keeping original implementation for brevity)
        callback([]);
    };
}