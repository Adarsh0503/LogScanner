from flask import Flask, request, jsonify, send_file, after_this_request
import os
import uuid
import shutil
import zipfile
import threading
import time
import tempfile
from datetime import datetime
from werkzeug.utils import secure_filename

# Import your scanner module
from logsprint import scan_logs_parallel

app = Flask(__name__)

# Directory to store scan results
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'scan_results')
os.makedirs(RESULTS_DIR, exist_ok=True)

@app.route('/scan', methods=['POST'])
def scan_logs_api():
    """Scan logs and prepare results for download."""
    try:
        # Get parameters from the request
        search_parameter = request.form.get('search_parameter')
        if not search_parameter:
            return jsonify({"error": "Search parameter is required"}), 400
        
        directory_path = request.form.get('directory_path')
        
        # Generate a unique ID for this scan
        result_id = str(uuid.uuid4())
        result_dir = os.path.join(RESULTS_DIR, result_id)
        os.makedirs(result_dir, exist_ok=True)
        
        # Handle directory path option
        if directory_path:
            if not os.path.exists(directory_path):
                return jsonify({"error": "Directory path does not exist"}), 400
            
            # Run the scan
            output_files = scan_logs_parallel(
                directory_path,
                search_parameter,
                output_file=os.path.join(result_dir, "scan_results")
            )
            
            if not output_files:
                shutil.rmtree(result_dir)
                return jsonify({"error": "No matches found or scan failed"}), 404
            
            # Return download URL
            return jsonify({
                "status": "success",
                "message": "Scan completed successfully",
                "download_url": f"/download/{result_id}"
            })
            
        # Handle uploaded files
        elif 'log_files' in request.files:
            uploaded_files = request.files.getlist('log_files')
            if not uploaded_files or not any(f.filename for f in uploaded_files):
                return jsonify({"error": "No files uploaded"}), 400
            
            # Create temp directory for uploaded files
            temp_dir = tempfile.mkdtemp()
            
            try:
                # Save uploaded files
                for file in uploaded_files:
                    if file.filename:
                        filename = secure_filename(file.filename)
                        file_path = os.path.join(temp_dir, filename)
                        file.save(file_path)
                
                # Run the scan
                output_files = scan_logs_parallel(
                    temp_dir,
                    search_parameter,
                    output_file=os.path.join(result_dir, "scan_results")
                )
                
                if not output_files:
                    shutil.rmtree(result_dir)
                    return jsonify({"error": "No matches found or scan failed"}), 404
                
                # Return download URL
                return jsonify({
                    "status": "success",
                    "message": "Scan completed successfully",
                    "download_url": f"/download/{result_id}"
                })
                
            finally:
                # Clean up temp directory
                shutil.rmtree(temp_dir, ignore_errors=True)
            
        else:
            return jsonify({"error": "Either directory_path or log_files must be provided"}), 400
            
    except Exception as e:
        # Clean up on error
        if 'result_dir' in locals() and os.path.exists(result_dir):
            shutil.rmtree(result_dir, ignore_errors=True)
        return jsonify({"error": str(e)}), 500

@app.route('/download/<result_id>', methods=['GET'])
def download_results(result_id):
    """Download results as zip and delete them immediately after."""
    result_dir = os.path.join(RESULTS_DIR, result_id)
    
    if not os.path.exists(result_dir):
        return jsonify({"error": "Results not found"}), 404
    
    # Create a zip file of results
    try:
        zip_path = tempfile.mktemp(suffix='.zip')
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, _, files in os.walk(result_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    zipf.write(file_path, os.path.basename(file_path))
        
        @after_this_request
        def cleanup(response):
            """Delete scan result files after sending the response"""
            def delayed_cleanup():
                # Small delay to ensure download starts
                time.sleep(1)
                try:
                    # Delete result directory
                    if os.path.exists(result_dir):
                        shutil.rmtree(result_dir, ignore_errors=True)
                    
                    # Delete zip file
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
                except Exception as e:
                    print(f"Error cleaning up files: {str(e)}")
            
            # Execute cleanup in background
            thread = threading.Thread(target=delayed_cleanup)
            thread.daemon = True
            thread.start()
            return response
        
        return send_file(
            zip_path,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"scan_results_{result_id}.zip"
        )
        
    except Exception as e:
        return jsonify({"error": f"Error creating download: {str(e)}"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Basic health check endpoint."""
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
