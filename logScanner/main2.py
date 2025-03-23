#!/usr/bin/env python3
import subprocess
import argparse
import os
from datetime import datetime

def search_with_powershell(file_path, search_parameter, output_file=None):
    """
    Search log file using PowerShell's Select-String (Windows native solution)
    """
    # Generate default output filename if not provided
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"log_results_{search_parameter}_{timestamp}.log"
    
    print("Searching using PowerShell Select-String...")
    start_time = datetime.now()
    
    # Construct PowerShell command
    ps_cmd = f'Select-String -Path "{file_path}" -SimpleMatch "{search_parameter}" | ForEach-Object {{ $_.Line }}'
    cmd = ["powershell", "-Command", ps_cmd]
    
    try:
        # Run the command and capture output
        process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        if process.returncode != 0:
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
        description="Search log files using PowerShell Select-String for Windows systems."
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
    
    args = parser.parse_args()
    
    # Check if file exists
    if not os.path.exists(args.file_path):
        print(f"Error: File '{args.file_path}' not found")
        return
    
    # Run the search
    search_with_powershell(
        args.file_path,
        args.search_parameter,
        args.output
    )

if __name__ == "__main__":
    main()
