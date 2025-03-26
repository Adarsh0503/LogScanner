from flask import Flask, request, jsonify, send_file
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
from werkzeug.utils import secure_filename

# Import your log scanner module
# Adjust the import path to match your project structure
from logsprint import scan_logs_parallel

app = Flask(__name__)

# Configure directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, 'scan_results')
os.makedirs(RESULTS_DIR, exist_ok=True)

# Registry to track downloads and cleanup status
CLEANUP_REGISTRY = os.path.join(RESULTS_DIR, "cleanup_registry.json")

def load_cleanup_registry():
    """Load the cleanup registry from file"""
    if os.path.exists(CLEANUP_REGISTRY):
        try:
            with open(CLEANUP_REGISTRY, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading cleanup registry: {str(e)}")
    return {}

def save_cleanup_registry(registry_data):
    """Save the cleanup registry to file"""
    try:
        with open(CLEANUP_REGISTRY, 'w') as f:
            json.dump(registry_data, f)
    except Exception as e:
        print(f"Error saving cleanup registry: {str(e)}")

def cleanup_completed_downloads():
    """Safely clean up files from completed downloads"""
    try:
        registry_data = load_cleanup_registry()
        current_time = time.time()
        items_to_remove = []
        
        for result_id, info in registry_data.items():
            # Only try to clean up files that are at least 10 minutes old
            # This ensures the download had plenty of time to complete
            if current_time - info["timestamp"] >= 600:  # 10 minutes
                try:
                    result_dir = info["result_dir"]
                    zip_path = info["zip_path"]
                    
                    # Try to delete the result directory
                    if os.path.exists(result_dir):
                        shutil.rmtree(result_dir, ignore_errors=True)
                    
                    # Try to delete the zip file
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
                    
                    # Mark this item for removal from registry
                    items_to_remove.append(result_id)
                    print(f"Successfully cleaned up {result_id}")
                except Exception as e:
                    print(f"Could not clean up {result_id} yet: {str(e)}")
                    # If deletion failed, update timestamp to try again later
                    registry_data[result_id]["retry_count"] = registry_data[result_id].get("retry_count", 0) + 1
                    
                    # If we've tried too many times, give up and log an error
                    if registry_data[result_id].get("retry_count", 0) > 24:  # Give up after ~4 hours (24 attempts at 10 min intervals)
                        print(f"Giving up on cleaning {result_id} after multiple attempts")
                        items_to_remove.append(result_id)
        
        # Remove successfully cleaned items from registry
        for item in items_to_remove:
            del registry_data[item]
        
        # Save updated registry
        save_cleanup_registry(registry_data)
    except Exception as e:
        print(f"Error in cleanup task: {str(e)}")

def schedule_cleanup():
    """Run the cleanup function periodically"""
    while True:
        try:
            cleanup_completed_downloads()
        except Exception as e:
            print(f"Error in cleanup job: {str(e)}")
        # Run every 10 minutes
        time.sleep(600)

# Start the cleanup thread
cleanup_thread = threading.Thread(target=schedule_cleanup)
cleanup_thread.daemon = True
cleanup_thread.start()

@app.route('/scan', methods=['POST'])
def scan_logs_api():
    """
    API endpoint to scan log files for specific patterns.
    
    Form parameters:
    - search_parameter: Text to search for in log files
    - directory_path: Path to directory containing log files (optional)
    - log_files: Files uploaded for scanning (optional)
    - max_file_size_mb: Maximum size of each output file in MB (default: 1)
    - use_mmap: Whether to use memory mapping (default: true)
    - num_processes: Number of processes to use (default: auto)
    
    Returns JSON with scan result metadata and download URL.
    """
    try:
        # Get parameters from the request
        search_parameter = request.form.get('search_parameter')
        if not search_parameter:
            return jsonify({"error": "Search parameter is required"}), 400
        
        # Parse optional parameters
        max_file_size_mb = int(request.form.get('max_file_size_mb', 1))
        use_mmap = request.form.get('use_mmap', 'true').lower() == 'true'
        
        num_processes = request.form.get('num_processes')
        if num_processes:
            num_processes = int(num_processes)
        
        # Generate a unique ID for this scan result
        result_id = str(uuid.uuid4())
        result_dir = os.path.join(RESULTS_DIR, result_id)
        os.makedirs(result_dir, exist_ok=True)
        
        directory_path = request.form.get('directory_path')
        
        output_files = None
        
        # Handle directory path option
        if directory_path:
            if not os.path.exists(directory_path):
                shutil.rmtree(result_dir)
                return jsonify({"error": "Directory path does not exist"}), 400
            
            # Run the scan
            output_files = scan_logs_parallel(
                directory_path,
                search_parameter,
                output_file=os.path.join(result_dir, "scan_results"),
                use_mmap=use_mmap,
                num_processes=num_processes,
                max_file_size_mb=max_file_size_mb
            )
        
        # Handle uploaded files
        elif 'log_files' in request.files:
            uploaded_files = request.files.getlist('log_files')
            if not uploaded_files or not any(f.filename for f in uploaded_files):
                shutil.rmtree(result_dir)
                return jsonify({"error": "No files uploaded"}), 400
            
            # Create a temporary directory to store uploaded files
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
                    output_file=os.path.join(result_dir, "scan_results"),
                    use_mmap=use_mmap,
                    num_processes=num_processes,
                    max_file_size_mb=max_file_size_mb
                )
            finally:
                # Clean up temporary directory
                shutil.rmtree(temp_dir, ignore_errors=True)
        
        else:
            shutil.rmtree(result_dir)
            return jsonify({"error": "Either directory_path or log_files must be provided"}), 400
        
        # Check if scan returned any results
        if not output_files:
            shutil.rmtree(result_dir)
            return jsonify({"error": "No matches found or scan failed"}), 404
        
        # Convert to list if it's a single string
        if isinstance(output_files, str):
            output_files = [output_files]
        
        # Create metadata about the scan
        metadata = {
            "search_parameter": search_parameter,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "file_count": len(output_files),
            "files": [os.path.basename(f) for f in output_files]
        }
        
        # Save metadata
        with open(os.path.join(result_dir, "metadata.json"), 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Return information about the results
        return jsonify({
            "status": "success",
            "message": f"Found results in {len(output_files)} file(s)",
            "result_id": result_id,
            "download_url": f"/download/{result_id}",
            "note": "Results will be automatically cleaned up after download"
        })
    
    except Exception as e:
        # Clean up on error
        if 'result_dir' in locals() and os.path.exists(result_dir):
            shutil.rmtree(result_dir, ignore_errors=True)
        return jsonify({"error": str(e)}), 500

@app.route('/download/<result_id>', methods=['GET'])
def download_results(result_id):
    """
    Download the complete scan results as a zip file.
    Files will be automatically cleaned up after the download is complete.
    
    Parameters:
    - result_id: ID of the scan result to download
    
    Returns a zip file containing all result files.
    """
    result_dir = os.path.join(RESULTS_DIR, result_id)
    
    if not os.path.exists(result_dir):
        return jsonify({"error": "Results not found or already deleted"}), 404
    
    try:
        # Create a zip file of results
        zip_name = f"scan_results_{result_id}.zip"
        zip_path = os.path.join(RESULTS_DIR, zip_name)
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, _, files in os.walk(result_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    zipf.write(file_path, os.path.basename(file_path))
        
        # Add to cleanup registry for later deletion
        registry_data = load_cleanup_registry()
        registry_data[result_id] = {
            "result_dir": result_dir,
            "zip_path": zip_path,
            "timestamp": time.time(),
            "retry_count": 0
        }
        save_cleanup_registry(registry_data)
        
        # Send the file for download without immediate deletion
        return send_file(
            zip_path,
            mimetype='application/zip',
            as_attachment=True,
            download_name=zip_name
        )
    
    except Exception as e:
        return jsonify({"error": f"Error creating download: {str(e)}"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    try:
        registry_data = load_cleanup_registry()
        pending_cleanups = len(registry_data)
        
        # Count results directories
        result_count = 0
        for item in os.listdir(RESULTS_DIR):
            if os.path.isdir(os.path.join(RESULTS_DIR, item)) and item != "__pycache__":
                result_count += 1
        
        return jsonify({
            "status": "ok",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "result_directories": result_count,
            "pending_cleanups": pending_cleanups
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
