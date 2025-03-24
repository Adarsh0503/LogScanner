#!/usr/bin/env python3
import os
import re
import mmap
import argparse
import multiprocessing
import time
import sys
from datetime import datetime
from functools import partial
# Custom progress tracking without external dependencies

# Global variables for statistics
TOTAL_MATCHES = multiprocessing.Value('i', 0)
TOTAL_FILES_PROCESSED = multiprocessing.Value('i', 0)
TOTAL_BYTES_PROCESSED = multiprocessing.Value('L', 0)


def scan_file_with_mmap(file_path, search_parameter, chunk_size=100*1024*1024, use_regex=False):
    """
    Scan a single file using memory-mapped I/O with chunked processing.
    Returns a list of matching lines.
    
    Args:
        file_path (str): Path to the log file
        search_parameter (str): Text or pattern to search for
        chunk_size (int): Size of chunks to process at once (default: 100MB)
        use_regex (bool): Whether to use regex pattern matching
        
    Returns:
        tuple: (file_path, matches)
    """
    matches = []
    
    # Compile regex pattern if using regex
    pattern = None
    if use_regex:
        try:
            pattern = re.compile(search_parameter.encode('utf-8'))
        except re.error as e:
            return file_path, [f"ERROR: Invalid regex pattern: {str(e)}"]
    
    try:
        # Get file size for chunking
        file_size = os.path.getsize(file_path)
        
        # Skip empty files
        if file_size == 0:
            return file_path, matches
        
        # Convert search parameter to bytes for mmap searching
        search_bytes = search_parameter.encode('utf-8') if not use_regex else None
        
        with open(file_path, 'rb') as f:
            # Process the file in chunks
            for chunk_start in range(0, file_size, chunk_size):
                chunk_end = min(chunk_start + chunk_size, file_size)
                actual_chunk_size = chunk_end - chunk_start
                
                # Create memory map for this chunk
                with mmap.mmap(f.fileno(), actual_chunk_size, 
                              access=mmap.ACCESS_READ, 
                              offset=chunk_start) as mm:
                    
                    # Adjust for potential line breaks across chunks
                    # If we're not at the start of the file, find the beginning of the first complete line
                    line_start_pos = 0
                    if chunk_start > 0:
                        # Find the first newline in this chunk
                        first_newline = mm.find(b'\n')
                        if first_newline != -1:
                            line_start_pos = first_newline + 1
                    
                    # If using regex
                    if use_regex:
                        # For regex, we'll process line by line
                        mm.seek(line_start_pos)
                        data = mm.read()
                        lines = data.split(b'\n')
                        
                        for i, line in enumerate(lines):
                            if pattern.search(line):
                                try:
                                    decoded_line = line.decode('utf-8', errors='replace')
                                    matches.append(decoded_line)
                                except Exception as e:
                                    matches.append(f"ERROR DECODING LINE: {str(e)}")
                    else:
                        # For simple string search, use mmap's efficient search
                        current_pos = line_start_pos
                        
                        while True:
                            found_pos = mm.find(search_bytes, current_pos)
                            if found_pos == -1:
                                break
                            
                            # Find the start of the line containing match
                            line_start = mm.rfind(b'\n', line_start_pos, found_pos)
                            if line_start == -1:  # If not found, start of visible chunk
                                line_start = line_start_pos
                            else:
                                line_start += 1  # Skip the newline character
                            
                            # Find the end of the line
                            line_end = mm.find(b'\n', found_pos)
                            if line_end == -1:  # If not found, end of chunk
                                line_end = mm.size()
                            
                            # Extract the line and decode to string
                            try:
                                line = mm[line_start:line_end].decode('utf-8', errors='replace')
                                matches.append(line)
                            except Exception as e:
                                matches.append(f"ERROR DECODING LINE: {str(e)}")
                            
                            # Move to position after current match
                            current_pos = found_pos + 1
                
                # Update bytes processed counter
                with TOTAL_BYTES_PROCESSED.get_lock():
                    TOTAL_BYTES_PROCESSED.value += actual_chunk_size
    
    except PermissionError:
        return file_path, [f"ERROR: Permission denied: {file_path}"]
    except IsADirectoryError:
        return file_path, [f"ERROR: Is a directory: {file_path}"]
    except Exception as e:
        return file_path, [f"ERROR: {str(e)}"]
    
    # Update processed files counter
    with TOTAL_FILES_PROCESSED.get_lock():
        TOTAL_FILES_PROCESSED.value += 1
    
    # Update matches counter
    with TOTAL_MATCHES.get_lock():
        TOTAL_MATCHES.value += len(matches)
    
    return file_path, matches


def write_results_to_file(file_path, matches, output_file, lock):
    """
    Write results to output file with proper locking for concurrent access.
    
    Args:
        file_path (str): Path to the processed file
        matches (list): List of matching lines
        output_file (str): Path to output file
        lock (multiprocessing.Lock): Lock for file access
    """
    if not matches:
        return
    
    with lock:
        with open(output_file, 'a') as out_file:
            out_file.write(f"\n{'=' * 80}\n")
            out_file.write(f"MATCHES FROM: {file_path}\n")
            out_file.write(f"{'=' * 80}\n\n")
            
            for line in matches:
                out_file.write(line + '\n')
            
            out_file.write(f"\nTotal matches in this file: {len(matches)}\n\n")


def process_file_wrapper(args):
    """
    Wrapper function for parallel processing that handles writing results directly.
    
    Args:
        args (tuple): (file_path, search_parameter, output_file, lock, use_regex, chunk_size)
        
    Returns:
        int: Number of matches found
    """
    file_path, search_parameter, output_file, lock, use_regex, chunk_size = args
    
    try:
        # Scan the file
        file_path, matches = scan_file_with_mmap(
            file_path, 
            search_parameter, 
            chunk_size=chunk_size,
            use_regex=use_regex
        )
        
        # Write results directly to the output file
        if matches:
            write_results_to_file(file_path, matches, output_file, lock)
        
        return len(matches)
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
        return 0


def scan_logs_parallel(directory_path, search_parameter, output_file=None, 
                      use_regex=False, num_processes=None, chunk_size=100*1024*1024,
                      file_extensions=None, follow_symlinks=False, max_depth=None,
                      min_file_size=None, max_file_size=None):
    """
    Scan all log files in the directory in parallel for lines containing the search parameter
    and write them directly to the output file.
    
    Args:
        directory_path (str): Path to the directory containing log files
        search_parameter (str): Text to search for in log files
        output_file (str, optional): Path to output file. If None, generates a default name.
        use_regex (bool): Whether to use regex pattern matching
        num_processes (int, optional): Number of processes to use. If None, uses CPU count.
        chunk_size (int): Size of chunks to process at once (default: 100MB)
        file_extensions (list): List of file extensions to include (default: ['.log'])
        follow_symlinks (bool): Whether to follow symlinks when searching for files
        max_depth (int, optional): Maximum directory depth to search
        min_file_size (int, optional): Minimum file size in bytes to process
        max_file_size (int, optional): Maximum file size in bytes to process
        
    Returns:
        str: Path to the output file
    """
    start_time = time.time()
    
    # Reset global counters
    TOTAL_MATCHES.value = 0
    TOTAL_FILES_PROCESSED.value = 0
    TOTAL_BYTES_PROCESSED.value = 0
    
    # Set default file extensions if not provided
    if file_extensions is None:
        file_extensions = ['.log', '.1', '.txt']
    
    # Generate default output filename if not provided
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_param = re.sub(r'[^\w]', '_', search_parameter)[:20]  # Make search param safe for filename
        output_file = f"combined_logs_{safe_param}_{timestamp}.log"
    
    # Create or clear the output file
    with open(output_file, 'w') as out_file:
        out_file.write(f"LOG SCAN RESULTS\n")
        out_file.write(f"Search Parameter: {search_parameter}\n")
        out_file.write(f"Directory: {directory_path}\n")
        out_file.write(f"Scan started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        out_file.write(f"{'=' * 80}\n\n")
    
    # Collect all matching files
    print(f"Searching for files in {directory_path}...")
    log_files = []
    
    for root, _, files in os.walk(directory_path, followlinks=follow_symlinks):
        # Check depth limit if specified
        if max_depth is not None:
            relative_path = os.path.relpath(root, directory_path)
            current_depth = 0 if relative_path == '.' else relative_path.count(os.sep) + 1
            if current_depth > max_depth:
                continue
        
        for file in files:
            file_path = os.path.join(root, file)
            
            # Check file extension - allow for both regular extensions and numeric extensions
            if not (any(file.endswith(ext) for ext in file_extensions) or 
                    (os.path.splitext(file)[1].isdigit() and os.path.splitext(os.path.splitext(file)[0])[1] in file_extensions)):
                continue
            
            # Check if it's a regular file
            if not os.path.isfile(file_path):
                continue
            
            # Check file size constraints
            if min_file_size is not None or max_file_size is not None:
                try:
                    file_size = os.path.getsize(file_path)
                    if min_file_size is not None and file_size < min_file_size:
                        continue
                    if max_file_size is not None and file_size > max_file_size:
                        continue
                except OSError:
                    # Skip files we can't get size for
                    continue
            
            log_files.append(file_path)
    
    total_files = len(log_files)
    print(f"Found {total_files} files to scan")
    
    if total_files == 0:
        print("No files found matching the criteria. Exiting.")
        return output_file
    
    # Determine number of processes - use fewer for small numbers of files
    if num_processes is None:
        num_processes = min(multiprocessing.cpu_count(), max(1, total_files // 2))
    
    # Create a lock for file access
    file_lock = multiprocessing.Manager().Lock()
    
    # Prepare arguments for process_file_wrapper
    args_list = [
        (file_path, search_parameter, output_file, file_lock, use_regex, chunk_size)
        for file_path in log_files
    ]
    
    print(f"Processing with {num_processes} processes {'using regex' if use_regex else 'using string search'}")
    
    # Process files in parallel without progress reporting
    print(f"Scanning {total_files} files...")
    
    with multiprocessing.Pool(processes=num_processes) as pool:
        # Wait for the process to finish its work by collecting the result
        # This ensures that all files are processed completely
        result = pool.map(process_file_wrapper, args_list)
    
    print(f"Completed scanning all files")
    
    # Calculate statistics
    total_matches = TOTAL_MATCHES.value
    total_files_processed = TOTAL_FILES_PROCESSED.value
    total_bytes_processed = TOTAL_BYTES_PROCESSED.value
    elapsed_time = time.time() - start_time
    
    # Format bytes in human-readable form
    def format_size(size_bytes):
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024 or unit == 'TB':
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024
    
    # Write summary to output file
    with open(output_file, 'a') as out_file:
        out_file.write(f"\n{'=' * 80}\n")
        out_file.write(f"SCAN SUMMARY\n")
        out_file.write(f"{'=' * 80}\n\n")
        out_file.write(f"Total files scanned: {total_files_processed}\n")
        out_file.write(f"Total data processed: {format_size(total_bytes_processed)}\n")
        out_file.write(f"Total matches found: {total_matches}\n")
        out_file.write(f"Elapsed time: {elapsed_time:.2f} seconds\n")
        out_file.write(f"Processing speed: {format_size(total_bytes_processed/max(1, elapsed_time))}/second\n")
        out_file.write(f"Scan completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # Print minimal console output
    print(f"\nScanning complete. Found {total_matches} matches across all files.")
    print(f"Results saved to: {output_file}")
    
    return output_file


def main():
    # Set up command line argument parsing
    parser = argparse.ArgumentParser(
        description="Efficiently scan log files for specific text and combine matching lines.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument(
        "search_parameter", 
        help="Text or pattern to search for in the log files"
    )
    parser.add_argument(
        "directory_path", 
        help="Path to the directory containing log files"
    )
    parser.add_argument(
        "-o", "--output", 
        help="Output file path (optional)",
        default=None
    )
    parser.add_argument(
        "-p", "--processes",
        type=int,
        default=None,
        help="Number of processes to use (default: number of CPU cores)"
    )
    parser.add_argument(
        "-r", "--regex",
        action="store_true",
        help="Use regex pattern matching instead of simple string search"
    )
    parser.add_argument(
        "-c", "--chunk-size",
        type=int,
        default=100*1024*1024,  # 100MB
        help="Chunk size in bytes for processing large files"
    )
    parser.add_argument(
        "-e", "--extensions",
        nargs="+",
        default=[".log", ".1", ".txt"],
        help="File extensions to scan (default: .log, .1, .txt)"
    )
    parser.add_argument(
        "-s", "--follow-symlinks",
        action="store_true",
        help="Follow symbolic links when searching for files"
    )
    parser.add_argument(
        "-d", "--max-depth",
        type=int,
        default=None,
        help="Maximum directory depth to search"
    )
    parser.add_argument(
        "--min-size",
        type=int,
        default=None,
        help="Minimum file size in bytes to process"
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=None,
        help="Maximum file size in bytes to process"
    )
    
    args = parser.parse_args()
    
    try:
        # Call the optimized scan_logs function with provided arguments
        scan_logs_parallel(
            args.directory_path,
            args.search_parameter,
            args.output,
            use_regex=args.regex,
            num_processes=args.processes,
            chunk_size=args.chunk_size,
            file_extensions=args.extensions,
            follow_symlinks=args.follow_symlinks,
            max_depth=args.max_depth,
            min_file_size=args.min_size,
            max_file_size=args.max_size
        )
    except KeyboardInterrupt:
        print("\nScan interrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
