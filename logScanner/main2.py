#!/usr/bin/env python3
import subprocess
import argparse
import os
from datetime import datetime

def search_with_grep(file_path, search_parameter, output_file=None, use_ripgrep=False):
    """
    Search log file using grep or ripgrep (rg) command line tools.
    
    Args:
        file_path: Path to log file
        search_parameter: String to search for
        output_file: Path to output file
        use_ripgrep: Whether to use ripgrep instead of grep
    """
    # Generate default output filename if not provided
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"log_results_{search_parameter}_{timestamp}.log"
    
    # Choose tool and construct command
    if use_ripgrep and subprocess.run(['which', 'rg'], stdout=subprocess.PIPE, stderr=subprocess.PIPE).returncode == 0:
        # ripgrep is installed
        tool = "rg"
        # -F: fixed strings, -a: binary files, -N: line number
        cmd = [tool, "-F", search_parameter, file_path, "--no-heading"]
    else:
        # fallback to grep
        tool = "grep"
        # -F: fixed strings, -a: binary files, -n: line number
        cmd = [tool, "-F", "-a", search_parameter, file_path]
    
    print(f"Searching using {tool}...")
    start_time = datetime.now()
    
    try:
        # Run the command and capture output
        process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        if process.returncode not in [0, 1]:  # grep returns 1 if no matches found
            print(f"Error: {process.stderr}")
            return None
        
        # Write output to file
        matches = process.stdout.splitlines()
        match_count = len(matches)
        
        with open(output_file, 'w') as out:
            out.write(f"SEARCH RESULTS FOR: {search_parameter}\n")
            out.write(f"SOURCE FILE: {file_path}\n")
            out.write(f"{'=' * 80}\n\n")
            
            for line in matches:
                out.write(line + '\n')
            
            elapsed = (datetime.now() - start_time).total_seconds()
            out.write(f"\nTotal matches: {match_count}\n")
            out.write(f"Search completed in {elapsed:.2f} seconds\n")
        
        print(f"Search complete. Found {match_count} matches in {elapsed:.2f} seconds.")
        print(f"Results saved to: {output_file}")
        
        return output_file
    
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return None

def main():
    parser = argparse.ArgumentParser(
        description="Search log files using grep or ripgrep for maximum performance."
    )
    parser.add_argument(
        "search_parameter", 
        help="Text to search for in the log file"
    )
    parser.add_argument(
        "file_path", 
        help="Path to the log file"
    )
    parser.add_argument(
        "-o", "--output", 
        help="Output file path (optional)",
        default=None
    )
    parser.add_argument(
        "-r", "--ripgrep",
        action="store_true",
        help="Use ripgrep (rg) instead of grep if available"
    )
    
    args = parser.parse_args()
    
    # Check if file exists
    if not os.path.exists(args.file_path):
        print(f"Error: File '{args.file_path}' not found")
        return
    
    # Run the search
    search_with_grep(
        args.file_path,
        args.search_parameter,
        args.output,
        use_ripgrep=args.ripgrep
    )

if __name__ == "__main__":
    main()
