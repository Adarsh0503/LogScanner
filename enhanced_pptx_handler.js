function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96;
    var pptxHtmlContent = null;
    var slideCount = 0;
    var lastRenderedPageIndex = -1;
    var lastRenderedScale = 1;
    var lastRenderedRotation = 0;
    var isFirstRender = true;
    var renderCache = new Map(); // Add rendering cache

    // Clone method required by InteractionController
    this.clone = function() {
        return new PptxHandler(document.createElement('canvas'));
    };

    // Enhanced initialization with better styling
    this.init = function (onCompletion) {
        console.log("Initializing Enhanced PptxHandler...");
        
        // Enhanced styling to fix PPTXjs rendering issues
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            /* Comprehensive fix for PPTXjs slide rendering */
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
            
            /* Fix for absolutely positioned content */
            .slide *[style*="position: absolute"],
            .slide *[style*="position:absolute"] {
                position: absolute !important;
            }
            
            /* Ensure content containers don't clip */
            .slide .block,
            .slide .content,
            .slide-content-container,
            .pptx-div-container,
            .divs2slidesjs-slide {
                overflow: visible !important;
                position: relative !important;
            }
            
            /* Fix for text and shape elements */
            .slide div, .slide span, .slide p {
                position: relative !important;
            }
            
            /* Canvas and viewer panel adjustments */
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
            
            #canvasContainer {
                display: flex;
                justify-content: center;
                align-items: flex-start;
                position: relative;
                margin: 20px auto;
            }
        `;
        document.head.appendChild(style);
        
        var script = document.createElement("script");
        script.onload = function () {
            console.log("pptxjs library loaded successfully.");
            if (onCompletion) {
                onCompletion();
            }
        };
        script.src = "js/libs/pptxjs.js?v=" + _UV_VERSION;
        document.head.appendChild(script);
    };

    // Enhanced content positioning fix
    function comprehensiveContentFix(slides) {
        console.log("Applying comprehensive content positioning fix for", slides.length, "slides");
        
        slides.forEach((slide, index) => {
            // Set slide container properties
            slide.style.position = "relative";
            slide.style.width = "1280px";
            slide.style.minHeight = "720px";
            slide.style.height = "auto";
            slide.style.padding = "100px 50px 100px 50px";
            slide.style.margin = "50px auto";
            slide.style.overflow = "visible";
            slide.style.backgroundColor = "white";
            slide.style.border = "none";
            slide.style.borderRadius = "0";
            slide.style.boxSizing = "border-box";
            
            // Fix absolutely positioned elements
            const positionedElements = slide.querySelectorAll('*');
            
            positionedElements.forEach(element => {
                const computedStyle = window.getComputedStyle(element);
                const elementStyle = element.style;
                
                // Fix elements with negative top positions
                if (elementStyle.top && elementStyle.top.includes('px')) {
                    const topPos = parseInt(elementStyle.top);
                    if (topPos < 0) {
                        const adjustedTop = Math.max(0, topPos + 100);
                        element.style.top = adjustedTop + 'px';
                        console.log(`Adjusted element top from ${topPos}px to ${adjustedTop}px in slide ${index+1}`);
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
                            console.log(`Adjusted translateY from ${translateY}px to ${adjustedTranslateY}px in slide ${index+1}`);
                        }
                    }
                }
                
                // Ensure visibility
                if (computedStyle.overflow === 'hidden') {
                    element.style.overflow = 'visible';
                }
            });
            
            console.log(`Slide ${index+1} content positioning fixed`);
        });
    }

    // Enhanced slide metrics calculation
    function calculateEnhancedSlideMetrics(slideElement) {
        if (!slideElement) return { minTop: 0, totalHeight: 720, adjustmentNeeded: 100 };
        
        let minTop = 0;
        let maxBottom = 720; // Start with minimum slide height
        let contentElements = [];
        
        // Get all elements with positioning
        const allElements = slideElement.querySelectorAll('*');
        
        allElements.forEach(element => {
            const style = element.style;
            const computedStyle = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            
            // Check for style-based positioning
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
            
            // Check for transform-based positioning
            if (style.transform && style.transform.includes('translate')) {
                const translateMatch = style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
                if (translateMatch && translateMatch[1]) {
                    const translateY = parseFloat(translateMatch[1]);
                    minTop = Math.min(minTop, translateY);
                }
            }
            
            // Use bounding rect as fallback
            if (rect.top && rect.height) {
                const slideRect = slideElement.getBoundingClientRect();
                const relativeTop = rect.top - slideRect.top;
                minTop = Math.min(minTop, relativeTop);
                maxBottom = Math.max(maxBottom, relativeTop + rect.height);
            }
        });
        
        // Calculate adjustment needed
        const adjustmentNeeded = Math.max(100, Math.abs(Math.min(0, minTop)) + 50);
        const totalHeight = Math.max(720, maxBottom - minTop + adjustmentNeeded * 2);
        
        console.log(`Enhanced slide metrics - minTop: ${minTop}px, maxBottom: ${maxBottom}px, adjustmentNeeded: ${adjustmentNeeded}px, totalHeight: ${totalHeight}px`);
        
        return {
            minTop: minTop,
            totalHeight: totalHeight,
            adjustmentNeeded: adjustmentNeeded,
            contentElements: contentElements
        };
    }

    // Enhanced document loading with better error handling
    this.loadDocument = async function (documentUrl, onCompletion, onError) {
        try {
            console.log("Loading PPTX document with enhanced handling:", documentUrl);
            benchmark.time("Enhanced PPTX Document loaded");
            
            // Create or ensure modal exists
            let targetElement = document.getElementById('myModal');
            if (!targetElement) {
                targetElement = document.createElement('div');
                targetElement.id = 'myModal';
                targetElement.style.display = 'none';
                document.body.appendChild(targetElement);
            }
            
            await new Promise((resolve, reject) => {
                let slideDetectionTimeout;
                let processingTimeout;
                
                const observer = new MutationObserver((mutations) => {
                    const slides = targetElement.querySelectorAll('.slide');
                    
                    if (slides.length > 0) {
                        console.log(`Enhanced detection: ${slides.length} slides found`);
                        
                        // Clear detection timeout
                        if (slideDetectionTimeout) clearTimeout(slideDetectionTimeout);
                        
                        // Set processing timeout
                        processingTimeout = setTimeout(() => {
                            observer.disconnect();
                            
                            try {
                                // Apply comprehensive content fixes
                                comprehensiveContentFix(slides);
                                
                                // Process slides with enhanced metrics
                                const slideContents = [];
                                slides.forEach((slide, index) => {
                                    const metrics = calculateEnhancedSlideMetrics(slide);
                                    
                                    // Apply calculated adjustments
                                    slide.style.minHeight = metrics.totalHeight + "px";
                                    slide.style.paddingTop = metrics.adjustmentNeeded + "px";
                                    slide.style.paddingBottom = metrics.adjustmentNeeded + "px";
                                    
                                    const slideHTML = slide.outerHTML;
                                    slideContents.push(slideHTML);
                                    console.log(`Enhanced processing: Slide ${index+1} prepared with metrics`);
                                });
                                
                                // Create enhanced result object
                                pptxHtmlContent = {
                                    slides: slideContents,
                                    presentationSize: { width: 1280, height: 720 }
                                };
                                
                                slideCount = slideContents.length;
                                console.log("Enhanced processing complete. Total slides:", slideCount);
                                
                                resolve();
                            } catch (processingError) {
                                console.error("Error in enhanced slide processing:", processingError);
                                reject(processingError);
                            }
                        }, 1500); // Increased processing delay for better results
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
                    if (processingTimeout) clearTimeout(processingTimeout);
                    reject(new Error("Enhanced PPTX conversion timed out - no slides detected"));
                }, 10000);
                
                // Initialize PPTXjs
                try {
                    $("#myModal").pptxToHtml({
                        pptxFileUrl: documentUrl,
                        slidesScale: 1,
                        slideMode: false,
                        keyBoardShortCut: false,
                        mediaProcess: false,
                        jsZipV2: false
                    });
                } catch (initError) {
                    observer.disconnect();
                    if (slideDetectionTimeout) clearTimeout(slideDetectionTimeout);
                    if (processingTimeout) clearTimeout(processingTimeout);
                    reject(initError);
                }
            });
            
            benchmark.timeEnd("Enhanced PPTX Document loaded");
            if (onCompletion) {
                onCompletion(null, pptxHtmlContent);
            }
        } catch (error) {
            console.error("Enhanced PPTX loading error:", error);
            benchmark.timeEnd("Enhanced PPTX Document loaded");
            if (onError) {
                onError(error);
            }
        }
    };

    // Enhanced drawing method
    this.drawDocument = function (scale, rotation, onCompletion) {
        console.log("Enhanced drawing - scale:", scale, "rotation:", rotation);
        benchmark.time("Enhanced PPTX Document drawn");
        self.redraw(scale, rotation, 0, function () {
            benchmark.timeEnd("Enhanced PPTX Document drawn");
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    this.applyToCanvas = function (apply) {
        apply(canvas);
    };

    this.pageCount = function () {
        return slideCount;
    };

    this.originalWidth = function () {
        return pptxHtmlContent?.presentationSize?.width || 1280;
    };

    this.originalHeight = function () {
        return pptxHtmlContent?.presentationSize?.height || 720;
    };

    // Enhanced redraw method with proper zoom handling
    this.redraw = function (scale, rotation, pageIndex, onCompletion) {
        console.log("Enhanced redraw - page:", pageIndex, "scale:", scale, "rotation:", rotation);

        // Create cache key
        const cacheKey = `${pageIndex}-${scale}-${rotation}`;
        
        // Check cache for identical renders (except for first render)
        if (!isFirstRender && renderCache.has(cacheKey)) {
            console.log("Using cached render for:", cacheKey);
            const cachedImageData = renderCache.get(cacheKey);
            
            // Restore from cache
            canvas.width = cachedImageData.width;
            canvas.height = cachedImageData.height;
            const ctx = canvas.getContext("2d");
            ctx.putImageData(cachedImageData.imageData, 0, 0);
            
            if (onCompletion) onCompletion();
            return;
        }
        
        // Update tracking variables
        lastRenderedPageIndex = pageIndex;
        lastRenderedScale = scale;
        lastRenderedRotation = rotation;

        if (!pptxHtmlContent?.slides?.[pageIndex]) {
            console.error("Enhanced redraw: No slide data available for index", pageIndex);
            if (onCompletion) onCompletion();
            return;
        }

        const slideHtml = pptxHtmlContent.slides[pageIndex];
        console.log("Enhanced redraw: Processing slide HTML for index", pageIndex);

        // Create enhanced temporary container
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = slideHtml;
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-20000px"; // Further off-screen
        tempDiv.style.top = "-20000px";
        tempDiv.style.zIndex = "-1000";
        
        const slideElement = tempDiv.querySelector('.slide');
        if (slideElement) {
            // Enhanced slide preparation
            slideElement.style.width = "1280px";
            slideElement.style.minHeight = "720px";
            slideElement.style.height = "auto";
            slideElement.style.backgroundColor = "white";
            slideElement.style.border = "none";
            slideElement.style.borderRadius = "0";
            slideElement.style.overflow = "visible";
            slideElement.style.position = "relative";
            
            // Apply progressive padding based on render state
            if (isFirstRender) {
                slideElement.style.padding = "200px 100px 200px 100px";
                isFirstRender = false;
            } else {
                slideElement.style.padding = "150px 75px 150px 75px";
            }
        }
        
        document.body.appendChild(tempDiv);

        // Calculate enhanced metrics
        const slideMetrics = calculateEnhancedSlideMetrics(slideElement);
        const renderHeight = Math.max(slideMetrics.totalHeight + 200, 1000); // Ensure minimum height
        
        console.log(`Enhanced redraw: Using render height ${renderHeight}px for slide ${pageIndex}`);

        // Enhanced html2canvas options
        const html2canvasOptions = {
            scale: Math.min(2, Math.max(1, 2 / scale)), // Adaptive scale based on zoom
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white",
            logging: false,
            width: 1280 + 200, // Extra width for safety
            height: renderHeight,
            windowWidth: 1280 + 200,
            windowHeight: renderHeight,
            x: 0,
            y: Math.min(-100, slideMetrics.minTop - 50),
            scrollX: 0,
            scrollY: Math.min(-100, slideMetrics.minTop - 50),
            removeContainer: true,
            ignoreElements: function(element) {
                // Ignore elements that might interfere with rendering
                return element.classList?.contains('ui-helper') || 
                       element.classList?.contains('ui-widget');
            }
        };

        html2canvas(tempDiv, html2canvasOptions).then(function (renderedCanvas) {
            console.log("Enhanced redraw: Canvas rendered successfully");
            
            try {
                // Calculate final dimensions with enhanced logic
                const sourceWidth = renderedCanvas.width;
                const sourceHeight = renderedCanvas.height;
                
                let finalWidth, finalHeight;
                
                // Enhanced dimension calculation for rotations
                if (rotation === 90 || rotation === 270) {
                    // For 90/270 rotations, calculate precise dimensions
                    const scaledWidth = 1280 * scale;
                    const scaledHeight = 720 * scale;
                    
                    // Create square canvas that can accommodate rotated content
                    const maxDimension = Math.max(scaledWidth, scaledHeight);
                    const diagonal = Math.sqrt(scaledWidth * scaledWidth + scaledHeight * scaledHeight);
                    
                    finalWidth = Math.ceil(diagonal + 100); // Extra padding
                    finalHeight = Math.ceil(diagonal + 100);
                } else {
                    // For 0/180 rotations, use scaled dimensions
                    finalWidth = Math.ceil(1280 * scale);
                    finalHeight = Math.ceil(720 * scale);
                }
                
                // Set canvas size
                canvas.width = finalWidth;
                canvas.height = finalHeight;
                
                console.log(`Enhanced redraw: Final canvas size ${finalWidth}x${finalHeight}`);
                
                // Enhanced drawing with proper centering
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#bbbbbb"; // Match viewer background
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.save();
                
                if (rotation !== 0) {
                    // Enhanced rotation handling
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    const drawWidth = 1280 * scale;
                    const drawHeight = 720 * scale;
                    
                    // Proper source rectangle calculation
                    const sourceX = Math.max(0, (sourceWidth - 1280) / 2);
                    const sourceY = Math.max(0, slideMetrics.adjustmentNeeded || 100);
                    const sourceDrawWidth = Math.min(1280, sourceWidth - sourceX);
                    const sourceDrawHeight = Math.min(720, sourceHeight - sourceY);
                    
                    ctx.drawImage(
                        renderedCanvas,
                        sourceX, sourceY, sourceDrawWidth, sourceDrawHeight,
                        -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight
                    );
                } else {
                    // Enhanced non-rotated drawing
                    const centerX = (canvas.width - 1280 * scale) / 2;
                    const centerY = (canvas.height - 720 * scale) / 2;
                    
                    // Improved source rectangle
                    const sourceX = Math.max(0, (sourceWidth - 1280) / 2);
                    const sourceY = Math.max(0, slideMetrics.adjustmentNeeded || 100);
                    const sourceDrawWidth = Math.min(1280, sourceWidth - sourceX);
                    const sourceDrawHeight = Math.min(720, sourceHeight - sourceY);
                    
                    ctx.drawImage(
                        renderedCanvas,
                        sourceX, sourceY, sourceDrawWidth, sourceDrawHeight,
                        centerX, centerY, 1280 * scale, 720 * scale
                    );
                }
                
                ctx.restore();
                
                // Cache the result for future use
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
                
                // Update annotation canvas
                const annotationCanvas = document.getElementById('annotationCanvas');
                if (annotationCanvas) {
                    annotationCanvas.width = canvas.width;
                    annotationCanvas.height = canvas.height;
                }
                
                // Update annotation handler
                if (window.annotationHandler) {
                    window.annotationHandler.setDimensionsAndCalcOffset(scale, canvas.width, canvas.height);
                    window.annotationHandler.saveOriginalCanvasSize(self.originalWidth(), self.originalHeight());
                }
                
                console.log("Enhanced redraw: Rendering complete");
                
            } catch (drawError) {
                console.error("Enhanced redraw: Drawing error", drawError);
                // Fallback rendering
                self.renderFallback(scale, rotation);
            } finally {
                // Always cleanup
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                
                if (onCompletion) {
                    onCompletion();
                }
            }
            
        }).catch(function (error) {
            console.error("Enhanced redraw: html2canvas error", error);
            
            // Fallback rendering
            self.renderFallback(scale, rotation);
            
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // Enhanced fallback rendering
    this.renderFallback = function(scale, rotation) {
        canvas.width = 1280 * scale;
        canvas.height = 720 * scale;
        
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#666";
        ctx.font = Math.floor(24 * scale) + "px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Slide rendering failed", canvas.width/2, canvas.height/2 - 20 * scale);
        ctx.fillText("Please try refreshing", canvas.width/2, canvas.height/2 + 20 * scale);
    };

    // Enhanced zoom handling with content preservation
    this.zoomToScale = function(scale, rotation, pageIndex, onCompletion) {
        console.log("Enhanced zoom to scale:", scale);
        
        const viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) {
            self.redraw(scale, rotation, pageIndex, onCompletion);
            return;
        }
        
        // Capture current viewport center
        const viewportWidth = viewerPanel.clientWidth;
        const viewportHeight = viewerPanel.clientHeight;
        const currentScale = lastRenderedScale || 1;
        
        const scrollLeft = viewerPanel.scrollLeft;
        const scrollTop = viewerPanel.scrollTop;
        const centerX = (scrollLeft + viewportWidth / 2) / currentScale;
        const centerY = (scrollTop + viewportHeight / 2) / currentScale;
        
        // Redraw with new scale
        self.redraw(scale, rotation, pageIndex, function() {
            // Restore viewport center
            const newScrollLeft = Math.max(0, (centerX * scale) - (viewportWidth / 2));
            const newScrollTop = Math.max(0, (centerY * scale) - (viewportHeight / 2));
            
            viewerPanel.scrollLeft = newScrollLeft;
            viewerPanel.scrollTop = newScrollTop;
            
            console.log("Enhanced zoom: Viewport centered at", newScrollLeft, newScrollTop);
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // Enhanced cleanup
    this.cleanup = function() {
        const myModal = document.getElementById('myModal');
        if (myModal) {
            document.body.removeChild(myModal);
        }
        
        renderCache.clear();
        pptxHtmlContent = null;
        slideCount = 0;
        
        console.log("Enhanced PptxHandler: Resources cleaned up");
    };

    // Enhanced createCanvases for thumbnails
    this.createCanvases = function (callback, fromPage, pageCount) {
        console.log("Enhanced createCanvases for thumbnails");
        pageCount = pageCount || self.pageCount();
        const toPage = Math.min(self.pageCount(), fromPage + pageCount - 1);
        const canvases = [];
        let processedCount = 0;

        for (let i = fromPage; i <= toPage; i++) {
            const slideHtml = pptxHtmlContent.slides[i];
            if (!slideHtml) {
                processedCount++;
                checkCompletion();
                continue;
            }

            // Create thumbnail with enhanced settings
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = slideHtml;
            tempDiv.style.position = "absolute";
            tempDiv.style.left = "-15000px";
            tempDiv.style.top = "-15000px";
            
            const slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.style.width = "1280px";
                slideElement.style.height = "720px";
                slideElement.style.padding = "50px";
                slideElement.style.backgroundColor = "white";
                slideElement.style.overflow = "visible";
            }
            
            document.body.appendChild(tempDiv);
            
            html2canvas(tempDiv, {
                scale: 0.5, // Smaller scale for thumbnails
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                width: 1380,
                height: 820,
                windowWidth: 1380,
                windowHeight: 820
            }).then(function(renderedCanvas) {
                // Create properly sized thumbnail
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = 160;
                thumbCanvas.height = 90;
                
                const thumbCtx = thumbCanvas.getContext('2d');
                thumbCtx.fillStyle = "white";
                thumbCtx.fillRect(0, 0, 160, 90);
                
                // Draw scaled down version
                thumbCtx.drawImage(renderedCanvas, 0, 0, 160, 90);
                
                canvases[i - fromPage] = {
                    canvas: thumbCanvas,
                    originalDocumentDpi: self.DPI
                };

                document.body.removeChild(tempDiv);
                processedCount++;
                checkCompletion();
            }).catch(function(error) {
                console.error(`Enhanced thumbnail error for slide ${i}:`, error);
                
                // Fallback thumbnail
                const fallbackCanvas = document.createElement('canvas');
                fallbackCanvas.width = 160;
                fallbackCanvas.height = 90;
                const ctx = fallbackCanvas.getContext('2d');
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, 160, 90);
                ctx.fillStyle = "#999";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.fillText(`Slide ${i+1}`, 80, 45);
                
                canvases[i - fromPage] = {
                    canvas: fallbackCanvas,
                    originalDocumentDpi: self.DPI
                };

                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                
                processedCount++;
                checkCompletion();
            });
        }
        
        function checkCompletion() {
            if (processedCount >= (toPage - fromPage + 1)) {
                const validCanvases = canvases.filter(canvas => canvas !== undefined);
                console.log("Enhanced createCanvases: Complete.", validCanvases.length, "thumbnails created");
                callback(validCanvases);
            }
        }
    };
}