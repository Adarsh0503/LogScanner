function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Standard DPI for PPTX rendering
    var pptxHtmlContent = null;
    var slideCount = 0;
    var lastRenderedPageIndex = -1;
    var lastRenderedScale = 1;
    var lastRenderedRotation = 0;
    
    // Clone method required by InteractionController
    this.clone = function() {
        return new PptxHandler(document.createElement('canvas'));
    };

    // Initialize the handler and load pptxjs library
    this.init = function(onCompletion) {
        console.log("Initializing PptxHandler...");
        
        // Ensure all required libraries are available
        if (typeof $ === 'undefined' || typeof html2canvas === 'undefined') {
            console.error("Required libraries not loaded: jQuery and/or html2canvas");
            return;
        }
        
        if (onCompletion) {
            onCompletion();
        }
    };

    // Load and process the PPTX document
    this.loadDocument = function(documentUrl, onCompletion, onError) {
        try {
            console.log("Loading PPTX document from URL:", documentUrl);
            benchmark.time("PPTX Document loaded");
            
            // Prepare container for slide content
            if (!document.getElementById('pptxjsContainer')) {
                var tmpDiv = document.createElement('div');
                tmpDiv.id = 'pptxjsContainer';
                tmpDiv.style.position = 'absolute';
                tmpDiv.style.left = '-9999px';
                tmpDiv.style.top = '-9999px';
                tmpDiv.style.visibility = 'hidden';
                document.body.appendChild(tmpDiv);
            }
            
            // Initialize progress tracking
            var loadingPromise = new Promise((resolve, reject) => {
                // Set timeout to prevent infinite waiting
                const timeoutId = setTimeout(() => {
                    reject(new Error("PPTX loading timed out after 45 seconds"));
                }, 45000);
                
                // Convert PPTX to HTML using pptxjs
                $("#pptxjsContainer").pptxToHtml({
                    pptxFileUrl: documentUrl,
                    slidesScale: "100%",
                    slideMode: false,
                    keyBoardShortCut: false,
                    slideModeConfig: {
                        first: 1,
                        nav: false
                    },
                    success: function() {
                        clearTimeout(timeoutId);
                        resolve();
                    },
                    error: function(e) {
                        clearTimeout(timeoutId);
                        reject(e || new Error("Failed to convert PPTX"));
                    }
                });
            });
            
            loadingPromise
                .then(() => {
                    console.log("PPTX converted to HTML successfully");
                    
                    // Process slides
                    const slideElements = document.querySelectorAll('#pptxjsContainer .slide');
                    slideCount = slideElements.length;
                    
                    if (slideCount === 0) {
                        throw new Error("No slides found in PPTX document");
                    }
                    
                    console.log(`Found ${slideCount} slides in the document`);
                    
                    // Extract slide content and dimensions
                    const slidesContent = [];
                    let maxWidth = 0;
                    let maxHeight = 0;
                    
                    slideElements.forEach((slide, index) => {
                        // Ensure slide is visible for measurement
                        slide.style.display = 'block';
                        
                        // Force proper rendering of slide elements
                        slide.style.width = '1280px'; // Standard PPT width
                        slide.style.height = 'auto';
                        slide.style.position = 'static';
                        slide.style.overflow = 'visible';
                        
                        // Measure actual content dimensions
                        const slideRect = slide.getBoundingClientRect();
                        const contentHeight = Math.max(
                            720, // Minimum height (standard PPT)
                            getActualContentHeight(slide)
                        );
                        
                        // Add margins to ensure all content is captured
                        slide.style.padding = '20px';
                        slide.style.height = contentHeight + 'px';
                        
                        // Record slide dimensions
                        maxWidth = Math.max(maxWidth, slideRect.width);
                        maxHeight = Math.max(maxHeight, contentHeight + 40); // Add padding
                        
                        slidesContent.push({
                            element: slide,
                            width: 1280, // Standard PPT width
                            height: contentHeight + 40
                        });
                        
                        // Hide slide after measurement
                        if (index > 0) {
                            slide.style.display = 'none';
                        }
                    });
                    
                    pptxHtmlContent = {
                        slides: slidesContent,
                        presentationSize: {
                            width: 1280, // Standard PPT width
                            height: maxHeight
                        }
                    };
                    
                    console.log("PPTX document processed successfully");
                    benchmark.timeEnd("PPTX Document loaded");
                    
                    if (onCompletion) {
                        onCompletion(null, pptxHtmlContent);
                    }
                })
                .catch(error => {
                    console.error("Error processing PPTX document:", error);
                    benchmark.timeEnd("PPTX Document loaded");
                    
                    if (onError) {
                        onError(error);
                    }
                });
        } catch (error) {
            console.error("Error in loadDocument:", error);
            benchmark.timeEnd("PPTX Document loaded");
            
            if (onError) {
                onError(error);
            }
        }
    };

    // Helper function to find actual content height of a slide
    function getActualContentHeight(slideElement) {
        let maxBottom = 0;
        
        // Process all child elements to find the actual bottom edge
        const allElements = slideElement.querySelectorAll('*');
        allElements.forEach(element => {
            if (element.offsetHeight) {
                const rect = element.getBoundingClientRect();
                const slideRect = slideElement.getBoundingClientRect();
                const relativeBottom = rect.bottom - slideRect.top + 
                                       parseInt(getComputedStyle(element).marginBottom || 0);
                
                if (relativeBottom > maxBottom) {
                    maxBottom = relativeBottom;
                }
            }
        });
        
        // Return the maximum height found (with minimum of 720px - standard slide height)
        return Math.max(720, maxBottom);
    }

    // Draw the PPTX slide on the canvas
    this.drawDocument = function(scale, rotation, onCompletion) {
        console.log("Drawing PPTX document with scale:", scale, "and rotation:", rotation);
        benchmark.time("PPTX Document drawn");
        
        this.redraw(scale, rotation, 0, function() {
            console.log("Redraw completed");
            benchmark.timeEnd("PPTX Document drawn");
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // Apply any custom drawing to the canvas
    this.applyToCanvas = function(apply) {
        console.log("Applying custom drawing to canvas");
        apply(canvas);
    };

    // Get the number of slides in the document
    this.pageCount = function() {
        return slideCount;
    };

    // Get the original width of the presentation
    this.originalWidth = function() {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize) {
            return pptxHtmlContent.presentationSize.width;
        }
        return 1280; // Default standard PowerPoint width
    };

    // Get the original height of the presentation
    this.originalHeight = function() {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize) {
            return pptxHtmlContent.presentationSize.height;
        }
        return 720; // Default standard PowerPoint height
    };

    // Redraw the slide content on the canvas
    this.redraw = function(scale, rotation, pageIndex, onCompletion) {
        console.log(`Redrawing PPTX slide ${pageIndex} with scale ${scale} and rotation ${rotation}`);
        
        // Check if we need to actually re-render or can reuse the last render
        if (lastRenderedPageIndex === pageIndex && 
            lastRenderedScale === scale && 
            lastRenderedRotation === rotation) {
            console.log("Using cached rendering");
            if (onCompletion) onCompletion();
            return;
        }
        
        // Save rendering parameters for caching
        lastRenderedPageIndex = pageIndex;
        lastRenderedScale = scale;
        lastRenderedRotation = rotation;
        
        try {
            // Validate parameters
            if (!pptxHtmlContent || !pptxHtmlContent.slides || pptxHtmlContent.slides.length === 0) {
                throw new Error("No slide content available for rendering");
            }
            
            if (pageIndex < 0 || pageIndex >= pptxHtmlContent.slides.length) {
                throw new Error(`Slide index ${pageIndex} out of bounds`);
            }
            
            // Get slide to render
            const slide = pptxHtmlContent.slides[pageIndex];
            
            // Make sure all slides except the current one are hidden
            pptxHtmlContent.slides.forEach((s, i) => {
                s.element.style.display = (i === pageIndex) ? 'block' : 'none';
            });
            
            // Set up proper dimensions and visibility for the current slide
            const slideElement = slide.element;
            slideElement.style.display = 'block';
            slideElement.style.width = slide.width + 'px';
            slideElement.style.height = slide.height + 'px';
            
            // Calculate scaled dimensions for the canvas
            const effectiveWidth = slide.width * scale;
            const effectiveHeight = slide.height * scale;
            
            // Set up canvas dimensions based on rotation
            if (rotation === 90 || rotation === 270) {
                canvas.width = effectiveHeight;
                canvas.height = effectiveWidth;
            } else {
                canvas.width = effectiveWidth;
                canvas.height = effectiveHeight;
            }
            
            // Use html2canvas to render the slide to canvas
            html2canvas(slideElement, {
                backgroundColor: "#FFFFFF",
                scale: 1,
                logging: false,
                useCORS: true,
                allowTaint: true,
                windowWidth: slide.width, 
                windowHeight: slide.height
            }).then(renderedCanvas => {
                // Draw the rendered content onto our target canvas
                const ctx = canvas.getContext('2d');
                
                // Clear the canvas
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Apply rotation if needed
                if (rotation !== 0) {
                    ctx.save();
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    if (rotation === 90 || rotation === 270) {
                        // For 90/270 degrees, swap dimensions
                        ctx.drawImage(
                            renderedCanvas,
                            -canvas.height / 2,
                            -canvas.width / 2,
                            canvas.height,
                            canvas.width
                        );
                    } else {
                        ctx.drawImage(
                            renderedCanvas,
                            -canvas.width / 2,
                            -canvas.height / 2,
                            canvas.width,
                            canvas.height
                        );
                    }
                    
                    ctx.restore();
                } else {
                    // No rotation
                    ctx.drawImage(
                        renderedCanvas,
                        0, 0,
                        canvas.width,
                        canvas.height
                    );
                }
                
                if (onCompletion) {
                    onCompletion();
                }
            }).catch(error => {
                console.error("Error rendering slide to canvas:", error);
                
                // Provide a fallback rendering
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = '#FF0000';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Error rendering slide ${pageIndex + 1}`, canvas.width / 2, canvas.height / 2);
                
                if (onCompletion) {
                    onCompletion();
                }
            });
        } catch (error) {
            console.error("Error in redraw:", error);
            
            // Provide error indication in the canvas
            const ctx = canvas.getContext('2d');
            canvas.width = this.originalWidth() * scale;
            canvas.height = this.originalHeight() * scale;
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#FF0000';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Error: ${error.message}`, canvas.width / 2, canvas.height / 2);
            
            if (onCompletion) {
                onCompletion();
            }
        }
    };

    // Create thumbnail canvases for all slides
    this.createCanvases = function(callback, dpiCalcFunction, fromPage, pageCount) {
        console.log("Creating thumbnail canvases for slides");
        
        if (!pptxHtmlContent || !pptxHtmlContent.slides) {
            console.error("No slides available for creating thumbnails");
            callback([]);
            return;
        }
        
        // Default to processing all slides if not specified
        fromPage = fromPage || 0;
        pageCount = pageCount || this.pageCount();
        
        const toPage = Math.min(this.pageCount() - 1, fromPage + pageCount - 1);
        const canvases = [];
        let processed = 0;
        
        for (let i = fromPage; i <= toPage; i++) {
            this.createThumbnailCanvas(i, (thumbnailCanvas) => {
                canvases[i - fromPage] = {
                    canvas: thumbnailCanvas,
                    originalDocumentDpi: self.DPI
                };
                
                processed++;
                
                if (processed >= (toPage - fromPage + 1)) {
                    callback(canvases);
                }
            });
        }
    };

    // Create a thumbnail canvas for a specific slide
    this.createThumbnailCanvas = function(pageIndex, callback) {
        try {
            if (!pptxHtmlContent || !pptxHtmlContent.slides || pageIndex >= pptxHtmlContent.slides.length) {
                throw new Error("Invalid slide index or slides not loaded");
            }
            
            const slide = pptxHtmlContent.slides[pageIndex];
            const thumbnailWidth = 160; // Standard thumbnail width
            const thumbnailHeight = Math.round(thumbnailWidth * slide.height / slide.width);
            
            // Show only the target slide
            pptxHtmlContent.slides.forEach((s, i) => {
                s.element.style.display = (i === pageIndex) ? 'block' : 'none';
            });
            
            // Render the slide
            html2canvas(slide.element, {
                backgroundColor: "#FFFFFF",
                scale: thumbnailWidth / slide.width,
                logging: false,
                useCORS: true,
                allowTaint: true
            }).then(renderedCanvas => {
                // Create a properly sized thumbnail canvas
                const thumbnailCanvas = document.createElement('canvas');
                thumbnailCanvas.width = thumbnailWidth;
                thumbnailCanvas.height = thumbnailHeight;
                
                // Draw the rendered slide onto the thumbnail canvas
                const ctx = thumbnailCanvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, thumbnailWidth, thumbnailHeight);
                ctx.drawImage(
                    renderedCanvas,
                    0, 0,
                    thumbnailWidth,
                    thumbnailHeight
                );
                
                callback(thumbnailCanvas);
            }).catch(error => {
                console.error(`Error creating thumbnail for slide ${pageIndex}:`, error);
                
                // Create fallback thumbnail
                const thumbnailCanvas = document.createElement('canvas');
                thumbnailCanvas.width = thumbnailWidth;
                thumbnailCanvas.height = thumbnailHeight;
                
                const ctx = thumbnailCanvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, thumbnailWidth, thumbnailHeight);
                
                ctx.fillStyle = '#FF0000';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Slide ${pageIndex + 1}`, thumbnailWidth / 2, thumbnailHeight / 2);
                
                callback(thumbnailCanvas);
            });
        } catch (error) {
            console.error(`Error in createThumbnailCanvas for slide ${pageIndex}:`, error);
            
            // Create error thumbnail
            const thumbnailCanvas = document.createElement('canvas');
            thumbnailCanvas.width = 160;
            thumbnailCanvas.height = 90;
            
            const ctx = thumbnailCanvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 160, 90);
            
            ctx.fillStyle = '#FF0000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Error: Slide ${pageIndex + 1}`, 80, 45);
            
            callback(thumbnailCanvas);
        }
    };

    // Clean up resources when done
    this.cleanup = function() {
        // Remove the temporary container
        const container = document.getElementById('pptxjsContainer');
        if (container) {
            document.body.removeChild(container);
        }
        
        // Clear references
        pptxHtmlContent = null;
        slideCount = 0;
        lastRenderedPageIndex = -1;
        console.log("PptxHandler resources cleaned up");
    };
}
