import shutil
import os

# Paths
cudnn_path = "C:\\Users\\12166\\Desktop\\cudnn-windows-x86_64-9.2.0.82_cuda12-archive"
cuda_path = "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.5"

# Move bin files
bin_src = os.path.join(cudnn_path, "bin")
bin_dst = os.path.join(cuda_path, "bin")
if not os.path.exists(bin_dst):
    os.makedirs(bin_dst)
for file_name in os.listdir(bin_src):
    full_file_name = os.path.join(bin_src, file_name)
    if os.path.isfile(full_file_name):
        shutil.copy(full_file_name, bin_dst)
        print(f"Copied {full_file_name} to {bin_dst}")

# Move include files
include_src = os.path.join(cudnn_path, "include")
include_dst = os.path.join(cuda_path, "include")
if not os.path.exists(include_dst):
    os.makedirs(include_dst)
for file_name in os.listdir(include_src):
    full_file_name = os.path.join(include_src, file_name)
    if os.path.isfile(full_file_name):
        shutil.copy(full_file_name, include_dst)
        print(f"Copied {full_file_name} to {include_dst}")

# Move lib files
lib_src = os.path.join(cudnn_path, "lib")
lib_dst = os.path.join(cuda_path, "lib\\x64")
if not os.path.exists(lib_dst):
    os.makedirs(lib_dst)
for file_name in os.listdir(lib_src):
    full_file_name = os.path.join(lib_src, file_name)
    if os.path.isfile(full_file_name):
        shutil.copy(full_file_name, lib_dst)
        print(f"Copied {full_file_name} to {lib_dst}")

print("All cuDNN files have been successfully copied.")
