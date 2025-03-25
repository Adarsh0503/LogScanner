from flask import Flask, request, jsonify, send_file
import os
import tempfile
import shutil
from werkzeug.utils import secure_filename
import multiprocessing
# Import your log scanner functions
from your_scanner_filename import scan_logs_parallel

app = Flask(__name__)
temp_files_to_clean = []

@app.after_request
def cleanup_temp_files(response):
    """Clean up any temporary files after the response is sent."""
    global temp_files_to_clean
    for path in temp_files_to_clean:
        try:
            if os.path.isfile(path):
                os.remove(path)
            elif os.path.isdir(path):
                shutil.rmtree(path)
        except Exception as e:
            app.logger.error(f"Error cleaning up {path}: {str(e)}")
    
    # Clear the list
    temp_files_to_clean = []
    return response

@app.route('/scan', methods=['POST'])
def scan_logs_api():
    global temp_files_to_clean
    temp_dir = None
    temp_zip = None
    
    try:
        # Get parameters from the request
        search_parameter = request.form.get('search_parameter')
        if not search_parameter:
            return jsonify({"error": "Search parameter is required"}), 400
            
        max_file_size_mb = int(request.form.get('max_file_size_mb', 1))
        use_mmap = request.form.get('use_mmap', 'true').lower() == 'true'
        
        # Parse number of processes
        num_processes = request.form.get('num_processes')
        if num_processes:
            num_processes = int(num_processes)
        else:
            num_processes = min(multiprocessing.cpu_count(), 4)  # Default to 4 or CPU count
        
        # Handle directory path option
        directory_path = request.form.get('directory_path')
        if directory_path:
            if not os.path.exists(directory_path):
                return jsonify({"error": "Directory path does not exist"}), 400
                
            # Scan the logs in the specified directory
            output_files = scan_logs_parallel(
                directory_path,
                search_parameter,
                output_file=None,  # Generate a default filename
                use_mmap=use_mmap,
                num_processes=num_processes,
                max_file_size_mb=max_file_size_mb
            )
            
            if not output_files:
                return jsonify({"error": "Scan failed or no matches found"}), 500
                
            # Create a zip file of results if multiple files
            if isinstance(output_files, list) and len(output_files) > 1:
                temp_zip = tempfile.mktemp(suffix='.zip')
                temp_files_to_clean.append(temp_zip)  # Add to cleanup list
                
                import zipfile
                with zipfile.ZipFile(temp_zip, 'w') as zipf:
                    for file in output_files:
                        zipf.write(file, os.path.basename(file))
                        temp_files_to_clean.append(file)  # Add result files to cleanup
                
                return send_file(
                    temp_zip,
                    mimetype='application/zip',
                    as_attachment=True,
                    download_name='scan_results.zip'
                )
            
            # Single file result
            elif isinstance(output_files, str) or (isinstance(output_files, list) and len(output_files) == 1):
                result_file = output_files[0] if isinstance(output_files, list) else output_files
                temp_files_to_clean.append(result_file)  # Add to cleanup list
                return send_file(
                    result_file,
                    mimetype='text/plain',
                    as_attachment=True,
                    download_name=os.path.basename(result_file)
                )
        
        # Handle uploaded files
        elif 'log_files' in request.files:
            uploaded_files = request.files.getlist('log_files')
            if not uploaded_files or not any(f.filename for f in uploaded_files):
                return jsonify({"error": "No files uploaded"}), 400
                
            # Create a temporary directory to store uploaded files
            temp_dir = tempfile.mkdtemp()
            temp_files_to_clean.append(temp_dir)  # Add to cleanup list
            
            # Save uploaded files
            for file in uploaded_files:
                if file.filename:
                    filename = secure_filename(file.filename)
                    file_path = os.path.join(temp_dir, filename)
                    file.save(file_path)
            
            # Scan the uploaded logs
            output_files = scan_logs_parallel(
                temp_dir,
                search_parameter,
                output_file=None,
                use_mmap=use_mmap,
                num_processes=num_processes,
                max_file_size_mb=max_file_size_mb
            )
            
            if not output_files:
                return jsonify({"error": "Scan failed or no matches found"}), 500
            
            # Create a zip file of results if multiple files
            if isinstance(output_files, list) and len(output_files) > 1:
                temp_zip = tempfile.mktemp(suffix='.zip')
                temp_files_to_clean.append(temp_zip)  # Add to cleanup list
                
                import zipfile
                with zipfile.ZipFile(temp_zip, 'w') as zipf:
                    for file in output_files:
                        zipf.write(file, os.path.basename(file))
                        temp_files_to_clean.append(file)  # Add result files to cleanup
                
                return send_file(
                    temp_zip,
                    mimetype='application/zip',
                    as_attachment=True,
                    download_name='scan_results.zip'
                )
            
            # Single file result
            elif isinstance(output_files, str) or (isinstance(output_files, list) and len(output_files) == 1):
                result_file = output_files[0] if isinstance(output_files, list) else output_files
                temp_files_to_clean.append(result_file)  # Add to cleanup list
                return send_file(
                    result_file,
                    mimetype='text/plain',
                    as_attachment=True,
                    download_name=os.path.basename(result_file)
                )
        
        else:
            return jsonify({"error": "Either directory_path or log_files must be provided"}), 400
            
    except Exception as e:
        # Make sure to add any created temporary files to the cleanup list
        if temp_dir and os.path.exists(temp_dir):
            temp_files_to_clean.append(temp_dir)
        if temp_zip and os.path.exists(temp_zip):
            temp_files_to_clean.append(temp_zip)
            
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
