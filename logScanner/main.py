#!/usr/bin/env python3
import os
import re
import mmap
import argparse
import multiprocessing
from datetime import datetime
from functools import partial

def scan_file_with_mmap(file_path, search_parameter):
    """
    Scan a single file using memory-mapped I/O for efficiency.
    Returns a list of matching lines.
    """
    matches = []
    try:
        with open(file_path, 'r') as f:
            # Memory map the file for faster access
            with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
                # Convert to bytes for mmap searching
                search_bytes = search_parameter.encode('utf-8')
                
                # Start position for searching
                current_pos = 0
                
                # Find each occurrence
                while True:
                    found_pos = mm.find(search_bytes, current_pos)
                    if found_pos == -1:
                        break
                    
                    # Find the start of the line containing match
                    line_start = mm.rfind(b'\n', 0, found_pos)
                    if line_start == -1:  # If not found, start of file
                        line_start = 0
                    else:
                        line_start += 1  # Skip the newline character
                    
                    # Find the end of the line
                    line_end = mm.find(b'\n', found_pos)
                    if line_end == -1:  # If not found, end of file
                        line_end = mm.size()
                    
                    # Extract the line and decode to string
                    line = mm[line_start:line_end].decode('utf-8', errors='replace')
                    matches.append(line)
                    
                    # Move to position after current match
                    current_pos = found_pos + 1
                    
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
    
    return file_path, matches

def process_file_generator(file_path, search_parameter):
    """
    Process a file using generators for memory efficiency.
    Alternative to mmap for certain cases.
    """
    matches = []
    try:
        with open(file_path, 'r') as f:
            for line in f:
                if search_parameter in line:
                    matches.append(line.rstrip('\n'))
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
    
    return file_path, matches

def scan_logs_parallel(directory_path, search_parameter, output_file=None, use_mmap=True, num_processes=None):
    """
    Scan all log files in the directory in parallel for lines containing the search parameter
    and combine them into a single output file.
    
    Args:
        directory_path (str): Path to the directory containing log files
        search_parameter (str): Text to search for in log files
        output_file (str, optional): Path to output file. If None, generates a default name.
        use_mmap (bool): Whether to use mmap for file processing
        num_processes (int, optional): Number of processes to use. If None, uses CPU count.
    
    Returns:
        str: Path to the output file
    """
    # Generate default output filename if not provided
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"combined_logs_{search_parameter}_{timestamp}.log"
    
    # Collect all log files
    log_files = []
    for root, _, files in os.walk(directory_path):
        for file in files:
            if file.endswith(".log"):
                log_files.append(os.path.join(root, file))
    
    print(f"Found {len(log_files)} log files to scan")
    
    # Determine number of processes
    if num_processes is None:
        num_processes = min(multiprocessing.cpu_count(), len(log_files))
    
    # Choose the processing function
    process_func = scan_file_with_mmap if use_mmap else process_file_generator
    
    # Process files in parallel
    print(f"Processing with {num_processes} processes {'using mmap' if use_mmap else 'using generators'}")
    
    with multiprocessing.Pool(processes=num_processes) as pool:
        # Create a partial function with the search parameter
        partial_func = partial(process_func, search_parameter=search_parameter)
        
        # Process all files and collect results
        results = pool.map(partial_func, log_files)
    
    # Write results to output file
    total_matches = 0
    with open(output_file, 'w') as out_file:
        for file_path, matches in results:
            if matches:
                out_file.write(f"\n{'=' * 80}\n")
                out_file.write(f"MATCHES FROM: {file_path}\n")
                out_file.write(f"{'=' * 80}\n\n")
                
                for line in matches:
                    out_file.write(line + '\n')
                
                out_file.write(f"\nTotal matches in this file: {len(matches)}\n\n")
                total_matches += len(matches)
    
    print(f"Scanning complete. Found {total_matches} matches across all files.")
    print(f"Results saved to: {output_file}")
    
    return output_file

def main():
    # Set up command line argument parsing
    parser = argparse.ArgumentParser(
        description="Scan log files for a specific parameter and combine matching lines."
    )
    parser.add_argument(
        "search_parameter", 
        help="Text to search for in the log files"
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
        "--no-mmap",
        action="store_true",
        help="Disable memory-mapped I/O (use for very large files or limited memory)"
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
    
    args = parser.parse_args()
    
    # If regex is requested, use the original regex-based function
    if args.regex:
        # Import the original regex-based function (assumed to be defined elsewhere)
        # scan_logs(args.directory_path, args.search_parameter, args.output)
        print("Regex-based scanning requested - this would use the regex implementation")
        return
    
    # Call the optimized scan_logs function with provided arguments
    scan_logs_parallel(
        args.directory_path, 
        args.search_parameter, 
        args.output,
        use_mmap=not args.no_mmap,
        num_processes=args.processes
    )

if __name__ == "__main__":
    main()