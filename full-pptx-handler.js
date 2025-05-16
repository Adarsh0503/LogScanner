/**
 * Enhanced PptxHandler that addresses rotation, zoom, and content preservation issues
 * This is a complete implementation that can replace the existing PptxHandler
 */
function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Standard DPI for PPTX rendering
    self.docCanvas = canvas;
    
    // Variables to store slide information
    var slideContent = null;
    var slideCount = 0;
    var maxSlideWidth = 1280; // Default PowerPoint slide width
    var maxSlideHeight = 720; // Default PowerPoint slide height
    
    // Cache for rendered slides to improve performance
    var slideCache = {};
    
    // Clone method required by InteractionController
    this.clone = function() {
        return new PptxHandler(document.createElement('canvas'));
    };

    // Initialize the handler
    this.init = function(onCompletion) {
        console.log("Initializing enhanced PptxHandler...");
        
        // Ensure required libraries are available
        if (typeof $ === 'undefined' || typeof html2canvas === 'undefined') {
            console.error("Required libraries not loaded: jQuery and/or html2canvas");
            return;
        }
        
        if (onCompletion) {
            onCompletion();
        }
    };

    // Load PPTX document
    this.loadDocument = function(documentUrl, onCompletion, onError) {
        console.log("Loading PPTX document from URL:", documentUrl);
        benchmark.time("PPTX Document loaded");
        
        // Clear any existing slide cache
        slideCache = {};
        
        // Create or get container for PPTX rendering
        var pptxContainer = document.getElementById('pptxjsContainer');
        if (!pptxContainer) {
            pptxContainer = document.createElement('div');
            pptxContainer.id = 'pptxjsContainer';
            pptxContainer.style.position = 'absolute';
            pptxContainer.style.left = '-9999px';
            pptxContainer.style.top = '-9999px';
            pptxContainer.style.visibility = 'hidden';
            document.body.appendChild(pptxContainer);
        }
        
        // Set timeout to prevent hanging on large documents
        var loadingTimeout = setTimeout(function() {
            console.error("PPTX loading timed out after 60 seconds");
            if (onError) onError(new Error("Loading timed out"));
        }, 60000);
        
        try {
            // Use pptxjs to convert PPTX to HTML
            $("#pptxjsContainer").pptxToHtml({
                pptxFileUrl: documentUrl,
                slidesScale: "100%", // Use 100% scale initially
                slideMode: false,    // Don't use slideshow mode
                keyBoardShortCut: false,
                slideModeConfig: {
                    first: 1,
                    nav: false
                },
                success: function() {
                    clearTimeout(loadingTimeout);
                    console.log("PPTX successfully converted to HTML");
                    
                    // Process the converted slides
                    setTimeout(function() {
                        try {
                            processSlides();
                            benchmark.timeEnd("PPTX Document loaded");
                            
                            if (onCompletion) {
                                onCompletion();
                            }
                        } catch (error) {
                            console.error("Error processing slides:", error);
                            if (onError) onError(error);
                        }
                    }, 1000); // Give extra time for content to fully render
                },
                error: function(err) {
                    clearTimeout(loadingTimeout);
                    console.error("Error in pptxToHtml:", err);
                    if (onError) onError(err || new Error("Failed to convert PPTX"));
                }
            });
        } catch (error) {
            clearTimeout(loadingTimeout);
            console.error("Exception in loadDocument:", error);
            if (onError) onError(error);
        }
        
        // Process slides after pptxjs completes conversion
        function processSlides() {
            // Get all slide elements
            var slideElements = document.querySelectorAll('#pptxjsContainer .slide');
            slideCount = slideElements.length;
            
            if (slideCount === 0) {
                throw new Error("No slides found in the PPTX document");
            }
            
            console.log("Found " + slideCount + " slides");
            
            // Initialize slide content array
            slideContent = [];
            maxSlideWidth = 0;
            maxSlideHeight = 0;
            
            // Process each slide
            for (var i = 0; i < slideElements.length; i++) {
                var slide = slideElements[i];
                
                // Set initial display properties for measurement
                slide.style.display = 'block';
                slide.style.position = 'relative';
                slide.style.overflow = 'visible';
                slide.style.transform = 'none';
                
                // Set width to standard PowerPoint width
                slide.style.width = '1280px';
                slide.style.height = 'auto';
                
                // Measure slide content
                var contentHeight = measureSlideContentHeight(slide);
                
                // Update maximum dimensions
                maxSlideWidth = Math.max(maxSlideWidth, 1280);
                maxSlideHeight = Math.max(maxSlideHeight, contentHeight);
                
                // Store slide information
                slideContent.push({
                    element: slide,
                    width: 1280,
                    height: contentHeight
                });
                
                // Hide all slides except the first
                if (i > 0) {
                    slide.style.display = 'none';
                }
            }
            
            console.log("Slide processing complete. Max dimensions:", maxSlideWidth, "x", maxSlideHeight);
        }
    };
    
    // Helper function to measure actual content height of a slide
    function measureSlideContentHeight(slideElement) {
        var minHeight = 720; // Minimum height (standard PowerPoint)
        
        try {
            // Find all content elements
            var elements = slideElement.querySelectorAll('*');
            var maxBottom = 0;
            
            // Find the bottom-most point of content
            for (var i = 0; i < elements.length; i++) {
                var element = elements[i];
                
                // Skip elements with no visible height
                if (element.offsetHeight > 0) {
                    // Get element bounding rect
                    var rect = element.getBoundingClientRect();
                    var slideRect = slideElement.getBoundingClientRect();
                    
                    // Calculate bottom position relative to slide
                    var bottom = rect.bottom - slideRect.top;
                    
                    // Add margin if present
                    var style = window.getComputedStyle(element);
                    var marginBottom = parseInt(style.marginBottom) || 0;
                    
                    // Update max position
                    maxBottom = Math.max(maxBottom, bottom + marginBottom);
                }
            }
            
            // Add extra padding to ensure all content is visible
            return Math.max(minHeight, maxBottom + 50);
        } catch (error) {
            console.warn("Error measuring slide height:", error);
            return minHeight; // Default to standard height
        }
    }

    // Draw the document with specified scale and rotation
    this.drawDocument = function(scale, rotation, onCompletion) {
        console.log("Drawing PPTX document with scale:", scale, "and rotation:", rotation);
        benchmark.time("PPTX Document drawn");
        
        this.redraw(scale, rotation, 0, function() {
            benchmark.timeEnd("PPTX Document drawn");
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // Apply custom drawing to canvas
    this.applyToCanvas = function(apply) {
        apply(self.docCanvas);
    };

    // Get the number of slides
    this.pageCount = function() {
        return slideCount;
    };

    // Get original width (needed for InteractionController)
    this.originalWidth = function() {
        return maxSlideWidth;
    };

    // Get original height (needed for InteractionController)
    this.originalHeight = function() {
        return maxSlideHeight;
    };

    // Redraw method that properly handles rotation and scaling
    this.redraw = function(scale, rotation, pageIndex, onCompletion) {
        console.log("Redrawing slide " + pageIndex + " with scale " + scale + " and rotation " + rotation + "°");
        
        if (!slideContent || !slideContent[pageIndex]) {
            console.error("No slide content available for rendering");
            if (onCompletion) onCompletion();
            return;
        }
        
        try {
            // Get current slide
            var slide = slideContent[pageIndex];
            
            // Make only the current slide visible
            for (var i = 0; i < slideContent.length; i++) {
                slideContent[i].element.style.display = (i === pageIndex) ? 'block' : 'none';
            }
            
            // Calculate dimensions that will fit rotated content
            var contentWidth = slide.width * scale;
            var contentHeight = slide.height * scale;
            
            // Use diagonal for rotated content to prevent clipping
            var canvasWidth, canvasHeight;
            
            if (rotation === 90 || rotation === 270) {
                // Calculate diagonal length as basis for canvas size
                var diagonal = Math.ceil(Math.sqrt(
                    contentWidth * contentWidth + contentHeight * contentHeight
                ));
                
                // Add padding to ensure no content is lost
                diagonal += 100;
                
                canvasWidth = diagonal;
                canvasHeight = diagonal;
            } else {
                // For 0° or 180° rotation, just use regular dimensions
                canvasWidth = contentWidth;
                canvasHeight = contentHeight;
            }
            
            // Set canvas dimensions
            self.docCanvas.width = canvasWidth;
            self.docCanvas.height = canvasHeight;
            
            // Check if we have a cached rendering for this slide
            var cacheKey = pageIndex + '-' + scale + '-' + rotation;
            
            if (slideCache[cacheKey]) {
                // Use cached canvas if available
                console.log("Using cached rendering for slide");
                var ctx = self.docCanvas.getContext('2d');
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.drawImage(slideCache[cacheKey], 0, 0, canvasWidth, canvasHeight);
                
                if (onCompletion) {
                    onCompletion();
                }
                return;
            }
            
            // Render the slide with html2canvas
            renderSlideToCanvas(slide.element, function(renderedCanvas) {
                if (!renderedCanvas) {
                    console.error("Failed to render slide");
                    drawErrorMessage();
                    if (onCompletion) onCompletion();
                    return;
                }
                
                // Draw the rendered slide with rotation
                var ctx = self.docCanvas.getContext('2d');
                
                // Clear canvas with white background
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                
                // Apply rotation if needed
                if (rotation !== 0) {
                    ctx.save();
                    
                    // Rotate around center of canvas
                    ctx.translate(canvasWidth / 2, canvasHeight / 2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    // Draw rotated content
                    if (rotation === 90 || rotation === 270) {
                        // Swap dimensions for 90/270 degree rotations
                        ctx.drawImage(
                            renderedCanvas,
                            -contentHeight / 2,   // Center X (swapped)
                            -contentWidth / 2,    // Center Y (swapped)
                            contentHeight,        // Width (swapped)
                            contentWidth          // Height (swapped)
                        );
                    } else {
                        // Normal dimensions for 0/180 degree rotations
                        ctx.drawImage(
                            renderedCanvas,
                            -contentWidth / 2,    // Center X
                            -contentHeight / 2,   // Center Y
                            contentWidth,
                            contentHeight
                        );
                    }
                    
                    ctx.restore();
                } else {
                    // No rotation, just center the content
                    var offsetX = (canvasWidth - contentWidth) / 2;
                    var offsetY = (canvasHeight - contentHeight) / 2;
                    
                    ctx.drawImage(
                        renderedCanvas,
                        offsetX, offsetY,
                        contentWidth, contentHeight
                    );
                }
                
                // Cache the rendered result
                cacheSlide(cacheKey, self.docCanvas);
                
                if (onCompletion) {
                    onCompletion();
                }
            });
        } catch (error) {
            console.error("Error in redraw:", error);
            drawErrorMessage();
            
            if (onCompletion) {
                onCompletion();
            }
        }
        
        // Helper function to draw error message
        function drawErrorMessage() {
            var ctx = self.docCanvas.getContext('2d');
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, self.docCanvas.width, self.docCanvas.height);
            
            ctx.fillStyle = "red";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                "Error rendering slide " + (pageIndex + 1),
                self.docCanvas.width / 2,
                self.docCanvas.height / 2
            );
        }
        
        // Helper function to cache slide rendering
        function cacheSlide(key, canvas) {
            // Only cache if we have less than 10 cached slides
            var cacheCount = Object.keys(slideCache).length;
            if (cacheCount >= 10) {
                // Remove oldest cache entry
                var oldestKey = Object.keys(slideCache)[0];
                delete slideCache[oldestKey];
            }
            
            // Create a copy of the canvas
            var cacheCanvas = document.createElement('canvas');
            cacheCanvas.width = canvas.width;
            cacheCanvas.height = canvas.height;
            var cacheCtx = cacheCanvas.getContext('2d');
            cacheCtx.drawImage(canvas, 0, 0);
            
            // Store in cache
            slideCache[key] = cacheCanvas;
        }
    };
    
    // Render a slide element to canvas using html2canvas
    function renderSlideToCanvas(slideElement, callback) {
        // Ensure slide is visible and properly sized
        slideElement.style.display = 'block';
        
        // Use html2canvas with appropriate settings
        html2canvas(slideElement, {
            backgroundColor: "white",
            scale: 1,
            logging: false,
            allowTaint: true,
            useCORS: true,
            onclone: function(clonedDoc) {
                // Ensure cloned element has correct styles
                var clonedSlide = clonedDoc.querySelector('#' + slideElement.id);
                if (clonedSlide) {
                    clonedSlide.style.transform = 'none';
                    clonedSlide.style.display = 'block';
                    clonedSlide.style.position = 'static';
                    clonedSlide.style.margin = '0';
                    clonedSlide.style.padding = '0';
                }
            }
        }).then(function(renderedCanvas) {
            callback(renderedCanvas);
        }).catch(function(error) {
            console.error("Error in html2canvas:", error);
            callback(null);
        });
    }

    // Create thumbnail canvases for multiple slides (needed for thumbnails feature)
    this.createCanvases = function(callback, dpiCalcFunction, fromPage, pageCount) {
        console.log("Creating thumbnail canvases from page " + fromPage);
        
        // Default parameters
        fromPage = fromPage || 0;
        pageCount = pageCount || this.pageCount();
        
        // Calculate range
        var toPage = Math.min(this.pageCount() - 1, fromPage + pageCount - 1);
        var thumbnailCanvases = [];
        var processedCount = 0;
        
        // Create thumbnail for each slide in range
        for (var i = fromPage; i <= toPage; i++) {
            createThumbnailCanvas(i, function(index, thumbnailCanvas) {
                thumbnailCanvases[index - fromPage] = {
                    canvas: thumbnailCanvas,
                    originalDocumentDpi: self.DPI
                };
                
                processedCount++;
                if (processedCount >= (toPage - fromPage + 1)) {
                    callback(thumbnailCanvases);
                }
            }.bind(null, i));
        }
    };
    
    // Create a thumbnail canvas for a specific slide
    function createThumbnailCanvas(pageIndex, callback) {
        if (!slideContent || !slideContent[pageIndex]) {
            console.error("No slide content for thumbnail");
            createFallbackThumbnail(pageIndex, callback);
            return;
        }
        
        try {
            var slide = slideContent[pageIndex];
            
            // Make only this slide visible
            for (var i = 0; i < slideContent.length; i++) {
                slideContent[i].element.style.display = (i === pageIndex) ? 'block' : 'none';
            }
            
            // Define thumbnail size
            var thumbWidth = 160; // Standard thumbnail width
            var thumbHeight = Math.round(thumbWidth * slide.height / slide.width);
            
            // Render slide to canvas
            renderSlideToCanvas(slide.element, function(renderedCanvas) {
                if (!renderedCanvas) {
                    createFallbackThumbnail(pageIndex, callback);
                    return;
                }
                
                // Create thumbnail canvas
                var thumbnailCanvas = document.createElement('canvas');
                thumbnailCanvas.width = thumbWidth;
                thumbnailCanvas.height = thumbHeight;
                
                // Draw rendered content scaled to thumbnail size
                var ctx = thumbnailCanvas.getContext('2d');
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, thumbWidth, thumbHeight);
                
                ctx.drawImage(
                    renderedCanvas,
                    0, 0,
                    thumbWidth, thumbHeight
                );
                
                callback(thumbnailCanvas);
            });
        } catch (error) {
            console.error("Error creating thumbnail:", error);
            createFallbackThumbnail(pageIndex, callback);
        }
    }
    
    // Create a fallback thumbnail with error message
    function createFallbackThumbnail(pageIndex, callback) {
        var thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.width = 160;
        thumbnailCanvas.height = 90;
        
        var ctx = thumbnailCanvas.getContext('2d');
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 160, 90);
        
        ctx.fillStyle = "red";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Slide " + (pageIndex + 1), 80, 45);
        
        callback(thumbnailCanvas);
    }
    
    // Adjust viewport to ensure content stays in view
    this.adjustViewport = function() {
        var viewportPanel = document.getElementById('viewerPanel');
        if (!viewportPanel) return;
        
        // Calculate maximum valid scroll positions
        var maxScrollLeft = Math.max(0, self.docCanvas.width - viewportPanel.clientWidth);
        var maxScrollTop = Math.max(0, self.docCanvas.height - viewportPanel.clientHeight);
        
        // Adjust scroll position if out of bounds
        if (viewportPanel.scrollLeft > maxScrollLeft) {
            viewportPanel.scrollLeft = maxScrollLeft;
        }
        
        if (viewportPanel.scrollTop > maxScrollTop) {
            viewportPanel.scrollTop = maxScrollTop;
        }
    };

    // Clean up resources
    this.cleanup = function() {
        // Clear slide cache
        slideCache = {};
        
        // Remove content from container
        var container = document.getElementById('pptxjsContainer');
        if (container) {
            container.innerHTML = '';
        }
        
        slideContent = null;
        slideCount = 0;
    };
}
