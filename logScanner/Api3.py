import os
import re
import uuid
import json
import time
import shutil
import zipfile
import threading
import tempfile
from datetime import datetime
from flask import Flask, request, jsonify, send_file, url_for
from werkzeug.utils import secure_filename

# Import your log scanner module
# Adjust the import path to match your project structure
from logsprint import scan_logs_parallel

app = Flask(__name__)

# Configure a directory to store scan results
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'scan_results')
os.makedirs(RESULTS_DIR, exist_ok=True)

# Cleanup job to remove old results
def cleanup_old_results(max_age_hours=24):
    """Remove scan results older than specified hours"""
    current_time = time.time()
    
    for result_id in os.listdir(RESULTS_DIR):
        result_path = os.path.join(RESULTS_DIR, result_id)
        if os.path.isdir(result_path):
            # Check if directory is older than 24 hours
            creation_time = os.path.getctime(result_path)
            if current_time - creation_time > max_age_hours * 60 * 60:
                try:
                    shutil.rmtree(result_path)
                    # Also remove the zip file if it exists
                    zip_path = os.path.join(RESULTS_DIR, f"{result_id}.zip")
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
                    print(f"Cleaned up old scan result: {result_id}")
                except Exception as e:
                    print(f"Error cleaning up {result_id}: {str(e)}")

# Schedule periodic cleanup
def schedule_cleanup():
    while True:
        try:
            cleanup_old_results()
        except Exception as e:
            print(f"Error in cleanup job: {str(e)}")
        # Sleep for 1 hour
        time.sleep(3600)

# Start the cleanup thread when the app starts
cleanup_thread = threading.Thread(target=schedule_cleanup)
cleanup_thread.daemon = True
cleanup_thread.start()

@app.route('/scan', methods=['POST'])
def scan_logs_api():
    """
    API endpoint to scan log files for specific patterns.
    
    Form parameters:
    - search_parameter: Text to search for in log files
    - directory_path: Path to directory containing log files
    - max_file_size_mb: Maximum size of each output file in MB (default: 1)
    - use_mmap: Whether to use memory mapping (default: true)
    - num_processes: Number of processes to use (default: CPU count)
    
    Returns JSON with scan result metadata and download URL.
    """
    try:
        # Get parameters from the request
        search_parameter = request.form.get('search_parameter')
        if not search_parameter:
            return jsonify({"error": "Search parameter is required"}), 400
        
        directory_path = request.form.get('directory_path')
        max_file_size_mb = int(request.form.get('max_file_size_mb', 1))
        use_mmap = request.form.get('use_mmap', 'true').lower() == 'true'
        num_processes = request.form.get('num_processes')
        
        if num_processes:
            num_processes = int(num_processes)
        
        # Handle directory path option
        if directory_path:
            if not os.path.exists(directory_path):
                return jsonify({"error": "Directory path does not exist"}), 400
            
            # Generate a unique ID for this scan result
            result_id = str(uuid.uuid4())
            result_dir = os.path.join(RESULTS_DIR, result_id)
            os.makedirs(result_dir, exist_ok=True)
            
            try:
                # Run the scan with output files going to the result directory
                output_files = scan_logs_parallel(
                    directory_path,
                    search_parameter,
                    output_file=os.path.join(result_dir, "scan_results"),
                    use_mmap=use_mmap,
                    num_processes=num_processes,
                    max_file_size_mb=max_file_size_mb
                )
                
                if not output_files:
                    return jsonify({"error": "No matches found or scan failed"}), 404
                
                # Create a metadata file with information about the scan
                file_list = output_files if isinstance(output_files, list) else [output_files]
                
                metadata = {
                    "search_parameter": search_parameter,
                    "directory_path": directory_path,
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "file_count": len(file_list),
                    "total_size_bytes": sum(os.path.getsize(f) for f in file_list if os.path.exists(f)),
                    "files": [os.path.basename(f) for f in file_list]
                }
                
                with open(os.path.join(result_dir, "metadata.json"), 'w') as f:
                    json.dump(metadata, f, indent=2)
                
                # Return information about where to find the results
                return jsonify({
                    "status": "success",
                    "message": f"Found results in {len(file_list)} file(s)",
                    "result_id": result_id,
                    "download_url": url_for('download_results', result_id=result_id, _external=True),
                    "info_url": url_for('get_result_info', result_id=result_id, _external=True),
                    "expiration": "Results will be available for 24 hours"
                })
                
            except Exception as e:
                # Clean up result directory on error
                shutil.rmtree(result_dir, ignore_errors=True)
                return jsonify({"error": f"Scan failed: {str(e)}"}), 500
        
        # Handle uploaded files
        elif 'log_files' in request.files:
            uploaded_files = request.files.getlist('log_files')
            if not uploaded_files or not any(f.filename for f in uploaded_files):
                return jsonify({"error": "No files uploaded"}), 400
            
            # Generate a unique ID for this scan
            result_id = str(uuid.uuid4())
            result_dir = os.path.join(RESULTS_DIR, result_id)
            os.makedirs(result_dir, exist_ok=True)
            
            # Create a temporary directory to store uploaded files
            temp_dir = tempfile.mkdtemp()
            
            try:
                # Save uploaded files
                saved_files = []
                for file in uploaded_files:
                    if file.filename:
                        filename = secure_filename(file.filename)
                        file_path = os.path.join(temp_dir, filename)
                        file.save(file_path)
                        saved_files.append(file_path)
                
                # Run the scan on the uploaded files
                output_files = scan_logs_parallel(
                    temp_dir,
                    search_parameter,
                    output_file=os.path.join(result_dir, "scan_results"),
                    use_mmap=use_mmap,
                    num_processes=num_processes,
                    max_file_size_mb=max_file_size_mb
                )
                
                if not output_files:
                    return jsonify({"error": "No matches found in uploaded files"}), 404
                
                # Create metadata
                file_list = output_files if isinstance(output_files, list) else [output_files]
                
                metadata = {
                    "search_parameter": search_parameter,
                    "uploaded_files": [os.path.basename(f) for f in saved_files],
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "file_count": len(file_list),
                    "total_size_bytes": sum(os.path.getsize(f) for f in file_list if os.path.exists(f)),
                    "files": [os.path.basename(f) for f in file_list]
                }
                
                with open(os.path.join(result_dir, "metadata.json"), 'w') as f:
                    json.dump(metadata, f, indent=2)
                
                return jsonify({
                    "status": "success",
                    "message": f"Found results in {len(file_list)} file(s)",
                    "result_id": result_id,
                    "download_url": url_for('download_results', result_id=result_id, _external=True),
                    "info_url": url_for('get_result_info', result_id=result_id, _external=True),
                    "expiration": "Results will be available for 24 hours"
                })
                
            except Exception as e:
                # Clean up on error
                shutil.rmtree(result_dir, ignore_errors=True)
                return jsonify({"error": f"Scan failed: {str(e)}"}), 500
            
            finally:
                # Clean up temporary directory
                shutil.rmtree(temp_dir, ignore_errors=True)
        
        else:
            return jsonify({"error": "Either directory_path or log_files must be provided"}), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/results/<result_id>/download', methods=['GET'])
def download_results(result_id):
    """
    Download the complete scan results as a zip file.
    
    Parameters:
    - result_id: ID of the scan result to download
    
    Returns a zip file containing all result files.
    """
    result_dir = os.path.join(RESULTS_DIR, result_id)
    
    if not os.path.exists(result_dir):
        return jsonify({"error": "Results not found or expired"}), 404
    
    # Check for existing zip file
    zip_path = os.path.join(RESULTS_DIR, f"{result_id}.zip")
    
    # Create the zip file if it doesn't exist
    if not os.path.exists(zip_path):
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, _, files in os.walk(result_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    zipf.write(file_path, os.path.basename(file_path))
    
    # Return the zip file for download
    try:
        return send_file(
            zip_path,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"scan_results_{result_id}.zip"
        )
    except Exception as e:
        return jsonify({"error": f"Error downloading file: {str(e)}"}), 500

@app.route('/results/<result_id>/file/<filename>', methods=['GET'])
def download_single_file(result_id, filename):
    """
    Download a single file from the scan results.
    
    Parameters:
    - result_id: ID of the scan result
    - filename: Name of the file to download
    
    Returns the requested file.
    """
    result_dir = os.path.join(RESULTS_DIR, result_id)
    
    if not os.path.exists(result_dir):
        return jsonify({"error": "Results not found or expired"}), 404
    
    file_path = os.path.join(result_dir, filename)
    
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        return jsonify({"error": f"File {filename} not found"}), 404
    
    try:
        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({"error": f"Error downloading file: {str(e)}"}), 500

@app.route('/results/<result_id>/info', methods=['GET'])
def get_result_info(result_id):
    """
    Get information about a specific scan result.
    
    Parameters:
    - result_id: ID of the scan result
    
    Returns JSON with metadata about the scan result.
    """
    result_dir = os.path.join(RESULTS_DIR, result_id)
    
    if not os.path.exists(result_dir):
        return jsonify({"error": "Results not found or expired"}), 404
    
    metadata_path = os.path.join(result_dir, "metadata.json")
    
    if os.path.exists(metadata_path):
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            # Add download URLs
            metadata["download_url"] = url_for('download_results', result_id=result_id, _external=True)
            
            # Add individual file download URLs
            file_urls = {}
            for file in metadata.get("files", []):
                file_urls[file] = url_for('download_single_file', 
                                          result_id=result_id, 
                                          filename=file, 
                                          _external=True)
            
            metadata["file_urls"] = file_urls
            
            return jsonify(metadata)
        except Exception as e:
            return jsonify({"error": f"Error reading metadata: {str(e)}"}), 500
    else:
        # If no metadata file, return basic info
        try:
            files = [f for f in os.listdir(result_dir) if os.path.isfile(os.path.join(result_dir, f))]
            
            file_urls = {}
            for file in files:
                file_urls[file] = url_for('download_single_file', 
                                        result_id=result_id, 
                                        filename=file, 
                                        _external=True)
            
            return jsonify({
                "result_id": result_id,
                "files": files,
                "download_url": url_for('download_results', result_id=result_id, _external=True),
                "file_urls": file_urls
            })
        except Exception as e:
            return jsonify({"error": f"Error reading directory: {str(e)}"}), 500

@app.route('/results', methods=['GET'])
def list_available_results():
    """
    List all available scan results.
    
    Returns a JSON list of available result IDs with their metadata.
    """
    try:
        results = []
        
        for result_id in os.listdir(RESULTS_DIR):
            result_path = os.path.join(RESULTS_DIR, result_id)
            if os.path.isdir(result_path):
                metadata_path = os.path.join(result_path, "metadata.json")
                
                result_info = {
                    "result_id": result_id,
                    "created": datetime.fromtimestamp(os.path.getctime(result_path)).strftime("%Y-%m-%d %H:%M:%S"),
                    "info_url": url_for('get_result_info', result_id=result_id, _external=True),
                    "download_url": url_for('download_results', result_id=result_id, _external=True)
                }
                
                # Add metadata if available
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, 'r') as f:
                            metadata = json.load(f)
                        result_info.update({
                            "search_parameter": metadata.get("search_parameter"),
                            "file_count": metadata.get("file_count"),
                            "total_size_bytes": metadata.get("total_size_bytes")
                        })
                    except:
                        pass
                
                results.append(result_info)
        
        return jsonify({
            "count": len(results),
            "results": results
        })
    except Exception as e:
        return jsonify({"error": f"Error listing results: {str(e)}"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """
    Simple health check endpoint.
    
    Returns status information about the API service.
    """
    return jsonify({
        "status": "ok",
        "version": "1.0.0",
        "results_dir": RESULTS_DIR,
        "results_count": len([d for d in os.listdir(RESULTS_DIR) if os.path.isdir(os.path.join(RESULTS_DIR, d))]),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

@app.route('/test-rollback', methods=['POST'])
def test_rollback():
    """
    Test endpoint that intentionally creates an error to test the rollback mechanism.
    
    Creates test files and then raises an exception to trigger rollback.
    """
    try:
        result_id = str(uuid.uuid4())
        result_dir = os.path.join(RESULTS_DIR, result_id)
        os.makedirs(result_dir, exist_ok=True)
        
        created_files = []
        
        # Create a few test files
        for i in range(3):
            filename = f"test_file_{i+1}.txt"
            file_path = os.path.join(result_dir, filename)
            with open(file_path, 'w') as f:
                f.write(f"This is test file {i+1}\n")
                f.write("="*50 + "\n")
                # Add some sample content
                for j in range(1000):
                    f.write(f"Sample log line {j}\n")
            created_files.append(file_path)
        
        # Simulate an error to trigger rollback
        raise RuntimeError("Simulated error to test rollback functionality")
        
    except Exception as e:
        # Clean up all created files (rollback)
        if 'result_dir' in locals() and os.path.exists(result_dir):
            try:
                shutil.rmtree(result_dir)
                # Check if cleanup was successful
                rollback_successful = not os.path.exists(result_dir)
            except Exception as cleanup_error:
                rollback_successful = False
        else:
            rollback_successful = True
        
        # Return information about the test
        return jsonify({
            "status": "rollback_tested",
            "error": str(e),
            "rollback_successful": rollback_successful,
            "created_files_count": len(created_files) if 'created_files' in locals() else 0
        })

if __name__ == '__main__':
    # For development only - use a production WSGI server in production
    app.run(debug=True, host='0.0.0.0', port=5000)
