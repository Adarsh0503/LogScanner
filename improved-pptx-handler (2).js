function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Standard DPI for PPTX rendering
    var pptxHtmlContent = null;
    var slideCount = 0;
    
    // Clone method required by InteractionController
    this.clone = function() {
        return new PptxHandler(document.createElement('canvas'));
    };

    // Initialize the handler
    this.init = function(onCompletion) {
        console.log("Initializing PptxHandler...");
        if (onCompletion) {
            onCompletion();
        }
    };

    // Load PPTX document
    this.loadDocument = function(documentUrl, onCompletion, onError) {
        console.log("Loading PPTX document from URL:", documentUrl);
        benchmark.time("PPTX Document loaded");
        
        // Create or retrieve temporary container
        if (!document.getElementById('pptxjsContainer')) {
            var tmpDiv = document.createElement('div');
            tmpDiv.id = 'pptxjsContainer';
            tmpDiv.style.position = 'absolute';
            tmpDiv.style.left = '-9999px';
            tmpDiv.style.top = '-9999px';
            document.body.appendChild(tmpDiv);
        }
        
        // Set a timeout for loading
        var loadingTimeout = setTimeout(function() {
            console.error("PPTX loading timed out");
            if (onError) onError(new Error("Loading timed out"));
        }, 60000); // 60 seconds timeout
        
        try {
            // Use pptxjs to convert PPTX to HTML
            $("#pptxjsContainer").pptxToHtml({
                pptxFileUrl: documentUrl,
                slidesScale: "100%",
                slideMode: false,
                keyBoardShortCut: false,
                success: function() {
                    clearTimeout(loadingTimeout);
                    
                    // Process the slides
                    try {
                        var slides = document.querySelectorAll('#pptxjsContainer .slide');
                        slideCount = slides.length;
                        
                        if (slideCount === 0) {
                            throw new Error("No slides found in the presentation");
                        }
                        
                        console.log("Found " + slideCount + " slides");
                        
                        // Wait for all slide content to be fully loaded
                        setTimeout(function() {
                            try {
                                // Process slide dimensions and content
                                var slideContentArray = [];
                                var maxWidth = 0;
                                var maxHeight = 0;
                                
                                // Process each slide
                                for (var i = 0; i < slides.length; i++) {
                                    var slide = slides[i];
                                    
                                    // Ensure slide is visible for measurement
                                    slide.style.display = 'block';
                                    slide.style.position = 'static';
                                    slide.style.transform = 'none';
                                    
                                    // Standard PowerPoint slide dimensions
                                    var standardWidth = 1280;
                                    
                                    // Make sure slide has enough width to measure properly
                                    slide.style.width = standardWidth + 'px';
                                    slide.style.height = 'auto';
                                    
                                    // Calculate actual content height
                                    var contentHeight = measureSlideContentHeight(slide);
                                    
                                    // Store slide information
                                    slideContentArray.push({
                                        element: slide,
                                        width: standardWidth,
                                        height: contentHeight
                                    });
                                    
                                    // Update max dimensions
                                    maxWidth = Math.max(maxWidth, standardWidth);
                                    maxHeight = Math.max(maxHeight, contentHeight);
                                    
                                    // Hide slides except the first one
                                    if (i > 0) {
                                        slide.style.display = 'none';
                                    }
                                }
                                
                                // Store slide content
                                pptxHtmlContent = {
                                    slides: slideContentArray,
                                    maxWidth: maxWidth,
                                    maxHeight: maxHeight
                                };
                                
                                console.log("PPTX processing complete");
                                benchmark.timeEnd("PPTX Document loaded");
                                
                                if (onCompletion) {
                                    onCompletion();
                                }
                            } catch (processingError) {
                                console.error("Error processing slides:", processingError);
                                if (onError) onError(processingError);
                            }
                        }, 1000); // Give extra time for all slide content to render
                    } catch (processingError) {
                        console.error("Error processing presentation:", processingError);
                        if (onError) onError(processingError);
                    }
                },
                error: function(errorMsg) {
                    clearTimeout(loadingTimeout);
                    console.error("Error loading PPTX:", errorMsg);
                    if (onError) onError(new Error(errorMsg || "Unknown error loading PPTX"));
                }
            });
        } catch (error) {
            clearTimeout(loadingTimeout);
            console.error("Exception in loadDocument:", error);
            if (onError) onError(error);
        }
    };
    
    // Helper function to measure the actual content height of a slide
    function measureSlideContentHeight(slideElement) {
        var minHeight = 720; // Standard PowerPoint slide height
        
        try {
            // Find all rendered content elements
            var contentElements = slideElement.querySelectorAll('*');
            var maxBottom = 0;
            
            // Examine each element to find the bottom-most point
            for (var i = 0; i < contentElements.length; i++) {
                var element = contentElements[i];
                if (element.offsetHeight > 0) {  // Skip invisible elements
                    var rect = element.getBoundingClientRect();
                    var slideRect = slideElement.getBoundingClientRect();
                    var bottom = rect.bottom - slideRect.top;
                    
                    // Consider margins
                    var style = window.getComputedStyle(element);
                    var marginBottom = parseInt(style.marginBottom) || 0;
                    
                    // Update max bottom position
                    maxBottom = Math.max(maxBottom, bottom + marginBottom);
                }
            }
            
            // Add some extra padding at the bottom
            var finalHeight = Math.max(minHeight, maxBottom + 50);
            console.log("Measured slide height: " + finalHeight + "px");
            return finalHeight;
        } catch (error) {
            console.warn("Error measuring slide height:", error);
            return minHeight; // Fall back to standard height
        }
    }

    // Draw the document with specified scale and rotation
    this.drawDocument = function(scale, rotation, onCompletion) {
        console.log("Drawing PPTX document with scale:", scale, "and rotation:", rotation);
        benchmark.time("PPTX Document drawn");
        
        this.redraw(scale, rotation, 0, function() {
            console.log("Initial draw completed");
            benchmark.timeEnd("PPTX Document drawn");
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // Apply custom drawing to canvas
    this.applyToCanvas = function(apply) {
        apply(canvas);
    };

    // Get the number of slides
    this.pageCount = function() {
        return slideCount;
    };

    // Get original width
    this.originalWidth = function() {
        if (pptxHtmlContent) {
            return pptxHtmlContent.maxWidth;
        }
        return 1280; // Standard PowerPoint width
    };

    // Get original height
    this.originalHeight = function() {
        if (pptxHtmlContent) {
            return pptxHtmlContent.maxHeight;
        }
        return 720; // Standard PowerPoint height
    };

    // Redraw with rotation support
    this.redraw = function(scale, rotation, pageIndex, onCompletion) {
        console.log("Redrawing slide " + pageIndex + " with scale " + scale + " and rotation " + rotation);
        
        if (!pptxHtmlContent || !pptxHtmlContent.slides || pageIndex >= pptxHtmlContent.slides.length) {
            console.error("Invalid slide data or index");
            if (onCompletion) onCompletion();
            return;
        }
        
        try {
            // Get the slide to render
            var slide = pptxHtmlContent.slides[pageIndex];
            
            // Make only the current slide visible
            for (var i = 0; i < pptxHtmlContent.slides.length; i++) {
                pptxHtmlContent.slides[i].element.style.display = (i === pageIndex) ? 'block' : 'none';
            }
            
            // Set proper dimensions for the slide
            slide.element.style.width = slide.width + 'px';
            slide.element.style.height = slide.height + 'px';
            
            // Calculate canvas dimensions that account for rotation
            var canvasWidth, canvasHeight;
            
            // Calculate the canvas dimensions based on rotation
            if (rotation === 90 || rotation === 270) {
                // For 90/270 degree rotations, we need to swap width and height
                // Also add padding to ensure no content is lost
                
                // Calculate the diagonal of the slide - this is the maximum possible dimension after rotation
                var diagonal = Math.ceil(Math.sqrt(Math.pow(slide.width * scale, 2) + Math.pow(slide.height * scale, 2)));
                
                // Set canvas size to the diagonal to ensure all content fits after rotation
                canvasWidth = diagonal;
                canvasHeight = diagonal;
            } else {
                // For 0/180 degree rotations, no need to swap dimensions
                canvasWidth = slide.width * scale;
                canvasHeight = slide.height * scale;
            }
            
            // Set canvas dimensions
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            
            // Use html2canvas to render the slide
            html2canvas(slide.element, {
                backgroundColor: "#FFFFFF",
                scale: 1,
                allowTaint: true,
                useCORS: true,
                logging: false
            }).then(function(renderedCanvas) {
                // Draw the rendered slide on our canvas
                var ctx = canvas.getContext('2d');
                
                // Fill with white background
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Get the dimensions for drawing
                var sourceWidth = renderedCanvas.width;
                var sourceHeight = renderedCanvas.height;
                var targetWidth = sourceWidth * scale;
                var targetHeight = sourceHeight * scale;
                
                // If we're rotating, we need to position the content carefully
                if (rotation !== 0) {
                    ctx.save();
                    
                    // Move to center of canvas for rotation
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    
                    // Apply rotation
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    // Draw the rotated content centered
                    if (rotation === 90 || rotation === 270) {
                        // For 90/270 degrees, we swap width and height
                        ctx.drawImage(
                            renderedCanvas,
                            -targetHeight / 2, // Center horizontally
                            -targetWidth / 2,  // Center vertically
                            targetHeight,      // Swapped width
                            targetWidth        // Swapped height
                        );
                    } else {
                        // For 0/180 degrees, no swapping needed
                        ctx.drawImage(
                            renderedCanvas,
                            -targetWidth / 2,  // Center horizontally
                            -targetHeight / 2, // Center vertically
                            targetWidth,
                            targetHeight
                        );
                    }
                    
                    ctx.restore();
                } else {
                    // No rotation - center the content
                    var offsetX = (canvas.width - targetWidth) / 2;
                    var offsetY = (canvas.height - targetHeight) / 2;
                    
                    ctx.drawImage(
                        renderedCanvas,
                        offsetX, offsetY,
                        targetWidth, targetHeight
                    );
                }
                
                if (onCompletion) {
                    onCompletion();
                }
            }).catch(function(error) {
                console.error("Error rendering slide to canvas:", error);
                
                // Draw error message
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = "#FF0000";
                ctx.font = "20px Arial";
                ctx.textAlign = "center";
                ctx.fillText("Error rendering slide " + (pageIndex+1), canvas.width/2, canvas.height/2);
                
                if (onCompletion) {
                    onCompletion();
                }
            });
        } catch (error) {
            console.error("Exception in redraw:", error);
            
            if (onCompletion) {
                onCompletion();
            }
        }
    };

    // Create thumbnail canvases for all slides
    this.createCanvases = function(callback, dpiCalcFunction, fromPage, pageCount) {
        console.log("Creating thumbnails from page " + fromPage + " for " + pageCount + " pages");
        
        if (!pptxHtmlContent || !pptxHtmlContent.slides) {
            console.error("No slides available for thumbnails");
            callback([]);
            return;
        }
        
        // Default parameters
        fromPage = fromPage || 0;
        pageCount = pageCount || this.pageCount();
        var toPage = Math.min(this.pageCount() - 1, fromPage + pageCount - 1);
        
        var thumbnailCanvases = [];
        var processedCount = 0;
        
        // Process each slide
        for (var i = fromPage; i <= toPage; i++) {
            this.createThumbnailCanvas(i, function(pageIndex, thumbnailCanvas) {
                thumbnailCanvases[pageIndex - fromPage] = {
                    canvas: thumbnailCanvas,
                    originalDocumentDpi: self.DPI
                };
                
                processedCount++;
                if (processedCount >= (toPage - fromPage + 1)) {
                    callback(thumbnailCanvases);
                }
            }.bind(this, i));
        }
    };

    // Create a thumbnail for a specific slide
    this.createThumbnailCanvas = function(pageIndex, callback) {
        try {
            if (!pptxHtmlContent || !pptxHtmlContent.slides || pageIndex >= pptxHtmlContent.slides.length) {
                throw new Error("Invalid slide data or index for thumbnail");
            }
            
            var slide = pptxHtmlContent.slides[pageIndex];
            
            // Make only this slide visible
            for (var i = 0; i < pptxHtmlContent.slides.length; i++) {
                pptxHtmlContent.slides[i].element.style.display = (i === pageIndex) ? 'block' : 'none';
            }
            
            // Set slide dimensions for rendering
            slide.element.style.width = slide.width + 'px';
            slide.element.style.height = slide.height + 'px';
            
            // Define thumbnail size (standard thumbnail dimensions)
            var thumbWidth = 160;
            var thumbHeight = Math.round(thumbWidth * slide.height / slide.width);
            
            // Render the slide
            html2canvas(slide.element, {
                backgroundColor: "#FFFFFF",
                scale: thumbWidth / slide.width,
                allowTaint: true,
                useCORS: true,
                logging: false
            }).then(function(renderedCanvas) {
                // Create thumbnail canvas with proper dimensions
                var thumbnailCanvas = document.createElement('canvas');
                thumbnailCanvas.width = thumbWidth;
                thumbnailCanvas.height = thumbHeight;
                
                // Draw the rendered content on the thumbnail
                var ctx = thumbnailCanvas.getContext('2d');
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, thumbWidth, thumbHeight);
                
                ctx.drawImage(
                    renderedCanvas,
                    0, 0,
                    thumbWidth, thumbHeight
                );
                
                // Return the thumbnail
                callback(thumbnailCanvas);
            }).catch(function(error) {
                console.error("Error creating thumbnail for slide " + pageIndex + ":", error);
                
                // Create a placeholder thumbnail with an error message
                var thumbnailCanvas = document.createElement('canvas');
                thumbnailCanvas.width = 160;
                thumbnailCanvas.height = 90;
                
                var ctx = thumbnailCanvas.getContext('2d');
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, 160, 90);
                
                ctx.fillStyle = "#FF0000";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.fillText("Error: Slide " + (pageIndex+1), 80, 45);
                
                callback(thumbnailCanvas);
            });
        } catch (error) {
            console.error("Exception in createThumbnailCanvas:", error);
            
            // Create a placeholder thumbnail with an error message
            var thumbnailCanvas = document.createElement('canvas');
            thumbnailCanvas.width = 160;
            thumbnailCanvas.height = 90;
            
            var ctx = thumbnailCanvas.getContext('2d');
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, 160, 90);
            
            ctx.fillStyle = "#FF0000";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Error: Slide " + (pageIndex+1), 80, 45);
            
            callback(thumbnailCanvas);
        }
    };

    // Clean up resources
    this.cleanup = function() {
        var container = document.getElementById('pptxjsContainer');
        if (container) {
            container.innerHTML = '';
        }
        
        pptxHtmlContent = null;
        slideCount = 0;
    };
}
