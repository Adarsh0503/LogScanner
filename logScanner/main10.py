#!/usr/bin/env python3
import os
import re
import mmap
import argparse
import multiprocessing
from datetime import datetime
from functools import partial
from collections import deque

def scan_file_with_mmap(file_path, search_parameter, context_lines=10):
    """
    Scan a single file using memory-mapped I/O for efficiency.
    Returns a list of matching lines with context (lines before and after).
    
    Args:
        file_path (str): Path to the log file
        search_parameter (str): Text to search for
        context_lines (int): Number of lines to include before and after each match
    """
    matches = []
    try:
        with open(file_path, 'r') as f:
            # First, read all lines of the file to build context
            all_lines = f.readlines()
            
            # Memory map the file for faster searching
            f.seek(0)  # Reset file position
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
                    matched_line = mm[line_start:line_end].decode('utf-8', errors='replace')
                    
                    # Determine line number for the matched line
                    # Count newlines up to the start of the match
                    line_count = mm[:line_start].count(b'\n')
                    match_line_number = line_count
                    
                    # Build context for this match
                    context_match = {
                        'match_line': matched_line,
                        'match_line_number': match_line_number,
                        'context_before': [],
                        'context_after': []
                    }
                    
                    # Add lines before the match
                    start_line = max(0, match_line_number - context_lines)
                    for i in range(start_line, match_line_number):
                        if i < len(all_lines):
                            context_match['context_before'].append(all_lines[i].rstrip('\n'))
                    
                    # Add lines after the match
                    end_line = min(len(all_lines), match_line_number + context_lines + 1)
                    for i in range(match_line_number + 1, end_line):
                        if i < len(all_lines):
                            context_match['context_after'].append(all_lines[i].rstrip('\n'))
                    
                    matches.append(context_match)
                    
                    # Move to position after current match
                    current_pos = found_pos + 1
    
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
    
    return file_path, matches

def process_file_generator(file_path, search_parameter, context_lines=10):
    """
    Process a file using generators for memory efficiency.
    Alternative to mmap for certain cases.
    Includes context lines before and after matches.
    """
    matches = []
    try:
        with open(file_path, 'r') as f:
            # First, read all lines of the file to build context
            all_lines = list(f)
            
            # Search for matches
            for i, line in enumerate(all_lines):
                if search_parameter in line:
                    context_match = {
                        'match_line': line.rstrip('\n'),
                        'match_line_number': i,
                        'context_before': [],
                        'context_after': []
                    }
                    
                    # Add lines before the match
                    start_line = max(0, i - context_lines)
                    for j in range(start_line, i):
                        context_match['context_before'].append(all_lines[j].rstrip('\n'))
                    
                    # Add lines after the match
                    end_line = min(len(all_lines), i + context_lines + 1)
                    for j in range(i + 1, end_line):
                        context_match['context_after'].append(all_lines[j].rstrip('\n'))
                    
                    matches.append(context_match)
    
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
    
    return file_path, matches

def scan_logs_parallel(directory_path, search_parameter, output_file=None, use_mmap=True, 
                      num_processes=None, context_lines=10):
    """
    Scan all log files in the directory in parallel for lines containing the search parameter
    and combine them into a single output file. Includes context lines before and after matches.
    
    Args:
        directory_path (str): Path to the directory containing log files
        search_parameter (str): Text to search for in log files
        output_file (str, optional): Path to output file. If None, generates a default name.
        use_mmap (bool): Whether to use mmap for file processing
        num_processes (int, optional): Number of processes to use. If None, uses CPU count.
        context_lines (int): Number of lines to include before and after each match
    
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
            if file.endswith(".log") or file.endswith(".1") or file.endswith(".txt"):
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
        # Create a partial function with the search parameter and context lines
        partial_func = partial(process_func, search_parameter=search_parameter, context_lines=context_lines)
        
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
                
                for idx, match_data in enumerate(matches):
                    # Write match number
                    out_file.write(f"MATCH #{idx + 1} (Line {match_data['match_line_number'] + 1}):\n")
                    out_file.write(f"{'-' * 40}\n")
                    
                    # Write context before
                    if match_data['context_before']:
                        out_file.write("CONTEXT BEFORE:\n")
                        for line in match_data['context_before']:
                            out_file.write(f"  {line}\n")
                        out_file.write("\n")
                    
                    # Write the match line (highlighted)
                    out_file.write("MATCHING LINE:\n")
                    out_file.write(f">> {match_data['match_line']}\n\n")
                    
                    # Write context after
                    if match_data['context_after']:
                        out_file.write("CONTEXT AFTER:\n")
                        for line in match_data['context_after']:
                            out_file.write(f"  {line}\n")
                    
                    out_file.write(f"\n{'-' * 80}\n\n")
                
                out_file.write(f"\nTotal matches in this file: {len(matches)}\n\n")
                total_matches += len(matches)
    
    print(f"Scanning complete. Found {total_matches} matches across all files.")
    print(f"Results saved to: {output_file}")
    
    return output_file

def main():
    # Set up command line argument parsing
    parser = argparse.ArgumentParser(
        description="Scan log files for a specific parameter and combine matching lines with context."
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
    parser.add_argument(
        "-c", "--context",
        type=int,
        default=10,
        help="Number of context lines to include before and after matches (default: 10)"
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
        num_processes=args.processes,
        context_lines=args.context
    )

if __name__ == "__main__":
    main()
