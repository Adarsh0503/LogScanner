import os
import uuid
import shutil
import zipfile
from flask import Flask, request, jsonify, send_file, url_for

app = Flask(__name__)

# Configure a directory to store scan results
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'scan_results')
os.makedirs(RESULTS_DIR, exist_ok=True)

@app.route('/scan', methods=['POST'])
def scan_logs_api():
    try:
        # Get parameters from the request
        search_parameter = request.form.get('search_parameter')
        directory_path = request.form.get('directory_path')
        max_file_size_mb = int(request.form.get('max_file_size_mb', 1))
        use_mmap = request.form.get('use_mmap', 'true').lower() == 'true'
        num_processes = request.form.get('num_processes')
        
        if num_processes:
            num_processes = int(num_processes)
        
        if not directory_path or not os.path.exists(directory_path):
            return jsonify({"error": "Invalid directory path"}), 400
            
        # Generate a unique ID for this scan result
        result_id = str(uuid.uuid4())
        result_dir = os.path.join(RESULTS_DIR, result_id)
        os.makedirs(result_dir, exist_ok=True)
        
        # Run the scan with output files going to the result directory
        output_files = scan_logs_parallel(
            directory_path,
            search_parameter,
            output_file=os.path.join(result_dir, "scan_results"),
            use_mmap=use_mmap,
            num_processes=num_processes,
            max_file_size_mb=max_file_size_mb
        )
        
        # Create a metadata file with information about the scan
        metadata = {
            "search_parameter": search_parameter,
            "directory_path": directory_path,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "file_count": len(output_files) if isinstance(output_files, list) else 1,
            "files": [os.path.basename(f) for f in (output_files if isinstance(output_files, list) else [output_files])]
        }
        
        with open(os.path.join(result_dir, "metadata.json"), 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Return information about where to find the results
        return jsonify({
            "status": "success",
            "result_id": result_id,
            "file_count": len(output_files) if isinstance(output_files, list) else 1,
            "download_url": url_for('download_results', result_id=result_id, _external=True),
            "expiration": "Results will be available for 24 hours"
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/results/<result_id>/download', methods=['GET'])
def download_results(result_id):
    """Download the complete results as a zip file"""
    result_dir = os.path.join(RESULTS_DIR, result_id)
    
    if not os.path.exists(result_dir):
        return jsonify({"error": "Results not found or expired"}), 404
    
    # Create a zip file containing all result files
    zip_path = os.path.join(RESULTS_DIR, f"{result_id}.zip")
    
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for root, _, files in os.walk(result_dir):
            for file in files:
                file_path = os.path.join(root, file)
                zipf.write(file_path, os.path.basename(file_path))
    
    # Return the zip file for download
    return send_file(
        zip_path,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"scan_results_{result_id}.zip"
    )

@app.route('/results/<result_id>/info', methods=['GET'])
def get_result_info(result_id):
    """Get information about a specific scan result"""
    result_dir = os.path.join(RESULTS_DIR, result_id)
    
    if not os.path.exists(result_dir):
        return jsonify({"error": "Results not found or expired"}), 404
    
    metadata_path = os.path.join(result_dir, "metadata.json")
    
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        return jsonify(metadata)
    else:
        # If no metadata file, return basic info
        files = os.listdir(result_dir)
        return jsonify({
            "result_id": result_id,
            "files": files,
            "download_url": url_for('download_results', result_id=result_id, _external=True)
        })

# Add a cleanup job to remove old results
def cleanup_old_results():
    """Remove scan results older than 24 hours"""
    current_time = time.time()
    
    for result_id in os.listdir(RESULTS_DIR):
        result_path = os.path.join(RESULTS_DIR, result_id)
        if os.path.isdir(result_path):
            # Check if directory is older than 24 hours
            creation_time = os.path.getctime(result_path)
            if current_time - creation_time > 24 * 60 * 60:
                try:
                    shutil.rmtree(result_path)
                    # Also remove the zip file if it exists
                    zip_path = os.path.join(RESULTS_DIR, f"{result_id}.zip")
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
                except Exception as e:
                    print(f"Error cleaning up {result_id}: {str(e)}")
