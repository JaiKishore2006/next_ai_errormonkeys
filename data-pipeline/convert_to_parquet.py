import pandas as pd
import time
import os

def convert():
    excel_path = "data-raw/online_retail_II.xlsx"
    parquet_path = "data-raw/retail.parquet"
    
    print(f"Reading {excel_path} (this takes 1-2 minutes)...")
    t0 = time.time()
    
    # Read all sheets (Year 2009-2010 and Year 2010-2011)
    sheets = pd.read_excel(excel_path, sheet_name=None, engine="openpyxl")
    print(f"Loaded sheets: {list(sheets.keys())} in {time.time() - t0:.1f}s")
    
    df = pd.concat(sheets.values(), ignore_index=True)
    print(f"Combined shape: {df.shape}")
    print(f"Columns: {list(df.columns)}")
    
    # Clean column names (strip spaces)
    df.columns = [str(c).strip() for c in df.columns]
    
    # Cast object/mixed columns to string so Arrow doesn't fail on mixed int/str
    string_cols = ["Invoice", "StockCode", "Description", "Customer ID", "Country"]
    for col in string_cols:
        if col in df.columns:
            df[col] = df[col].astype(str)
            
    df["Quantity"] = pd.to_numeric(df["Quantity"], errors="coerce")
    df["Price"] = pd.to_numeric(df["Price"], errors="coerce")
    
    df.to_parquet(parquet_path, index=False)
    print(f"Saved to {parquet_path} ({os.path.getsize(parquet_path) / 1024 / 1024:.1f} MB) in {time.time() - t0:.1f}s")

if __name__ == "__main__":
    convert()
